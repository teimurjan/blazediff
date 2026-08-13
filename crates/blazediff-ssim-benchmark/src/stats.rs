//! Correlation statistics, in the forms image-quality papers report them.
//!
//! Rank statistics (Spearman, Kendall) need no fitting and are the primary
//! numbers here. Pearson and RMSE only mean something after the monotonic
//! nonlinearity between a metric and human scores has been fitted out, which is
//! what [`logistic_fit`] does — the standard VQEG five-parameter mapping.

/// Spearman rank correlation: Pearson's r over the values' ranks, so it
/// measures whether two series *order* their subjects the same way without
/// assuming their scales are comparable. Ties share an averaged rank.
pub fn spearman(a: &[f64], b: &[f64]) -> f64 {
    pearson(&ranks(a), &ranks(b))
}

/// Kendall's tau-b: the excess of concordant over discordant pairs, corrected
/// for ties on either side. More conservative than Spearman and less swayed by
/// a handful of large rank displacements.
pub fn kendall_tau_b(a: &[f64], b: &[f64]) -> f64 {
    let n = a.len();
    let (mut concordant, mut discordant) = (0i64, 0i64);
    let (mut ties_a, mut ties_b) = (0i64, 0i64);

    for i in 0..n {
        for j in (i + 1)..n {
            let da = (a[i] - a[j]).partial_cmp(&0.0).unwrap() as i8;
            let db = (b[i] - b[j]).partial_cmp(&0.0).unwrap() as i8;
            match (da, db) {
                (0, 0) => {
                    ties_a += 1;
                    ties_b += 1;
                }
                (0, _) => ties_a += 1,
                (_, 0) => ties_b += 1,
                _ if da == db => concordant += 1,
                _ => discordant += 1,
            }
        }
    }

    let pairs = concordant + discordant;
    let denominator = (((pairs + ties_a) * (pairs + ties_b)) as f64).sqrt();
    if denominator == 0.0 {
        f64::NAN
    } else {
        (concordant - discordant) as f64 / denominator
    }
}

pub fn pearson(a: &[f64], b: &[f64]) -> f64 {
    let n = a.len() as f64;
    let mean_a = a.iter().sum::<f64>() / n;
    let mean_b = b.iter().sum::<f64>() / n;
    let mut covariance = 0.0;
    let mut var_a = 0.0;
    let mut var_b = 0.0;
    for (x, y) in a.iter().zip(b) {
        let (dx, dy) = (x - mean_a, y - mean_b);
        covariance += dx * dy;
        var_a += dx * dx;
        var_b += dy * dy;
    }
    let denominator = (var_a * var_b).sqrt();
    if denominator == 0.0 {
        // Every value tied on one side — no ordering to agree or disagree with.
        f64::NAN
    } else {
        covariance / denominator
    }
}

fn ranks(values: &[f64]) -> Vec<f64> {
    let mut order: Vec<usize> = (0..values.len()).collect();
    order.sort_by(|x, y| values[*x].partial_cmp(&values[*y]).unwrap());

    let mut out = vec![0.0; values.len()];
    let mut start = 0;
    while start < order.len() {
        let mut end = start;
        while end + 1 < order.len() && values[order[end + 1]] == values[order[start]] {
            end += 1;
        }
        let averaged = (start + end) as f64 / 2.0 + 1.0;
        for slot in &order[start..=end] {
            out[*slot] = averaged;
        }
        start = end + 1;
    }
    out
}

/// The five-parameter logistic VQEG prescribes for mapping a metric onto the
/// subjective scale before Pearson correlation and RMSE are computed:
///
/// `q(x) = β1·(0.5 − 1/(1 + e^(β2·(x − β3)))) + β4·x + β5`
fn logistic(beta: &[f64; 5], x: f64) -> f64 {
    let exponent = (beta[1] * (x - beta[2])).clamp(-500.0, 500.0);
    beta[0] * (0.5 - 1.0 / (1.0 + exponent.exp())) + beta[3] * x + beta[4]
}

/// Fit the logistic and return `(PLCC, RMSE)` of the mapped predictions.
///
/// Fitted by Nelder-Mead from several starting points — derivative-free, so
/// there is no Jacobian to get subtly wrong, and restarts cover the local
/// minima a single simplex can fall into. Falls back to the unmapped
/// correlation if no start converges to something better than the identity.
pub fn logistic_fit(predictions: &[f64], subjective: &[f64]) -> (f64, f64) {
    let n = predictions.len() as f64;
    let mean_subjective = subjective.iter().sum::<f64>() / n;
    let (low, high) = minmax(subjective);
    let (pred_low, pred_high) = minmax(predictions);
    let pred_mean = predictions.iter().sum::<f64>() / n;
    let pred_spread = (predictions
        .iter()
        .map(|p| (p - pred_mean).powi(2))
        .sum::<f64>()
        / n)
        .sqrt()
        .max(1e-9);

    let cost = |beta: &[f64; 5]| {
        let mut sse = 0.0;
        for (p, s) in predictions.iter().zip(subjective) {
            let residual = logistic(beta, *p) - s;
            sse += residual * residual;
        }
        if sse.is_finite() {
            sse
        } else {
            f64::MAX
        }
    };

    // Metrics differ enormously in how compressed their range is — MS-SSIM
    // spends most of its mass within a few 1e-2 of 1.0 while dssim spreads over
    // an order of magnitude — so the logistic's steepness has to be searched
    // across scales, not guessed once. A single start silently converges to a
    // near-linear fit for the compressed metrics and understates their PLCC.
    let mut starts = Vec::new();
    for steepness in [0.25, 1.0, 4.0, 16.0, 64.0] {
        for sign in [1.0, -1.0] {
            starts.push([
                high - low,
                sign * steepness / pred_spread,
                pred_mean,
                0.0,
                low,
            ]);
            starts.push([
                high - low,
                sign * steepness * 4.0 / (pred_high - pred_low).max(1e-9),
                pred_mean,
                1.0,
                mean_subjective,
            ]);
        }
    }

    let mut best = None::<([f64; 5], f64)>;
    for start in starts {
        let (beta, sse) = nelder_mead(start, &cost);
        if best.as_ref().is_none_or(|(_, current)| sse < *current) {
            best = Some((beta, sse));
        }
    }

    let Some((beta, _)) = best else {
        return (pearson(predictions, subjective), f64::NAN);
    };

    let mapped: Vec<f64> = predictions.iter().map(|p| logistic(&beta, *p)).collect();
    let plcc = pearson(&mapped, subjective);
    let rmse = (mapped
        .iter()
        .zip(subjective)
        .map(|(m, s)| (m - s).powi(2))
        .sum::<f64>()
        / n)
        .sqrt();

    // A degenerate fit (flat mapping) collapses PLCC to NaN; the unmapped
    // correlation is a truthful floor in that case.
    if plcc.is_finite() {
        (plcc, rmse)
    } else {
        (pearson(predictions, subjective), rmse)
    }
}

fn minmax(values: &[f64]) -> (f64, f64) {
    values
        .iter()
        .fold((f64::MAX, f64::MIN), |(lo, hi), v| (lo.min(*v), hi.max(*v)))
}

/// Textbook Nelder-Mead over five parameters.
fn nelder_mead(start: [f64; 5], cost: &impl Fn(&[f64; 5]) -> f64) -> ([f64; 5], f64) {
    const DIM: usize = 5;
    const MAX_ITERS: usize = 4000;

    let mut simplex: Vec<[f64; 5]> = Vec::with_capacity(DIM + 1);
    simplex.push(start);
    for axis in 0..DIM {
        let mut vertex = start;
        let step = if vertex[axis].abs() > 1e-9 {
            vertex[axis] * 0.05
        } else {
            0.05
        };
        vertex[axis] += step;
        simplex.push(vertex);
    }
    let mut values: Vec<f64> = simplex.iter().map(cost).collect();

    for _ in 0..MAX_ITERS {
        let mut order: Vec<usize> = (0..simplex.len()).collect();
        order.sort_by(|a, b| values[*a].partial_cmp(&values[*b]).unwrap());
        let (best, worst) = (order[0], order[DIM]);
        let second_worst = order[DIM - 1];

        if (values[worst] - values[best]).abs() <= 1e-12 * (values[best].abs() + 1e-12) {
            break;
        }

        let mut centroid = [0.0; DIM];
        for index in &order[..DIM] {
            for (slot, value) in centroid.iter_mut().zip(simplex[*index]) {
                *slot += value / DIM as f64;
            }
        }

        let blend = |factor: f64| -> [f64; 5] {
            std::array::from_fn(|k| centroid[k] + factor * (centroid[k] - simplex[worst][k]))
        };

        let reflected = blend(1.0);
        let reflected_cost = cost(&reflected);
        if reflected_cost < values[second_worst] {
            if reflected_cost < values[best] {
                let expanded = blend(2.0);
                let expanded_cost = cost(&expanded);
                if expanded_cost < reflected_cost {
                    simplex[worst] = expanded;
                    values[worst] = expanded_cost;
                    continue;
                }
            }
            simplex[worst] = reflected;
            values[worst] = reflected_cost;
            continue;
        }

        let contracted = blend(-0.5);
        let contracted_cost = cost(&contracted);
        if contracted_cost < values[worst] {
            simplex[worst] = contracted;
            values[worst] = contracted_cost;
            continue;
        }

        // Shrink every vertex toward the best one.
        let anchor = simplex[best];
        for index in &order[1..] {
            simplex[*index] =
                std::array::from_fn(|k| anchor[k] + 0.5 * (simplex[*index][k] - anchor[k]));
            values[*index] = cost(&simplex[*index]);
        }
    }

    let best = (0..simplex.len())
        .min_by(|a, b| values[*a].partial_cmp(&values[*b]).unwrap())
        .unwrap();
    (simplex[best], values[best])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spearman_is_one_for_a_monotone_relabelling() {
        let a = [1.0, 2.0, 3.0, 4.0];
        let b = [10.0, 200.0, 3000.0, 40000.0];
        assert!((spearman(&a, &b) - 1.0).abs() < 1e-12);
    }

    #[test]
    fn spearman_is_minus_one_when_reversed() {
        let a = [1.0, 2.0, 3.0, 4.0];
        let b = [4.0, 3.0, 2.0, 1.0];
        assert!((spearman(&a, &b) + 1.0).abs() < 1e-12);
    }

    #[test]
    fn ties_share_an_averaged_rank() {
        assert_eq!(ranks(&[5.0, 5.0, 9.0]), vec![1.5, 1.5, 3.0]);
    }

    #[test]
    fn a_constant_series_has_no_correlation_to_report() {
        assert!(spearman(&[1.0, 1.0, 1.0], &[1.0, 2.0, 3.0]).is_nan());
    }

    #[test]
    fn kendall_matches_a_hand_computed_case() {
        // 3 concordant pairs, 0 discordant, no ties.
        assert!((kendall_tau_b(&[1.0, 2.0, 3.0], &[5.0, 6.0, 7.0]) - 1.0).abs() < 1e-12);
        assert!((kendall_tau_b(&[1.0, 2.0, 3.0], &[7.0, 6.0, 5.0]) + 1.0).abs() < 1e-12);
        // One swap out of three pairs: (3-1)/3.
        let tau = kendall_tau_b(&[1.0, 2.0, 3.0], &[6.0, 5.0, 7.0]);
        assert!((tau - 1.0 / 3.0).abs() < 1e-12, "got {tau}");
    }

    #[test]
    fn the_logistic_fit_straightens_a_monotone_nonlinearity() {
        // Subjective scores that are a saturating function of the metric:
        // Pearson on the raw values is mediocre, and near-perfect after fitting.
        let predictions: Vec<f64> = (0..120).map(|i| i as f64 / 119.0).collect();
        let subjective: Vec<f64> = predictions
            .iter()
            .map(|p| 5.0 / (1.0 + (-12.0 * (p - 0.5)).exp()))
            .collect();

        let raw = pearson(&predictions, &subjective).abs();
        let (plcc, rmse) = logistic_fit(&predictions, &subjective);
        assert!(plcc > raw, "fit {plcc} should beat raw {raw}");
        assert!(plcc > 0.99, "fit should be near-perfect, got {plcc}");
        assert!(rmse < 0.1, "rmse {rmse}");
    }

    #[test]
    fn the_logistic_fit_survives_a_perfectly_linear_relationship() {
        let predictions: Vec<f64> = (0..50).map(|i| i as f64).collect();
        let subjective: Vec<f64> = predictions.iter().map(|p| 2.0 * p + 3.0).collect();
        let (plcc, rmse) = logistic_fit(&predictions, &subjective);
        assert!(plcc > 0.999, "got {plcc}");
        assert!(rmse < 1.0, "got {rmse}");
    }
}
