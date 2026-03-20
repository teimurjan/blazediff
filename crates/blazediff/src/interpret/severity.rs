use super::types::ChangeSeverity;

/// Classify severity from diff percentage.
/// - Low: < 1%
/// - Medium: 1% - 10%
/// - High: > 10%
pub fn classify_severity(diff_percentage: f64) -> ChangeSeverity {
    if diff_percentage < 1.0 {
        ChangeSeverity::Low
    } else if diff_percentage <= 10.0 {
        ChangeSeverity::Medium
    } else {
        ChangeSeverity::High
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_low_severity() {
        assert_eq!(classify_severity(0.0), ChangeSeverity::Low);
        assert_eq!(classify_severity(0.5), ChangeSeverity::Low);
        assert_eq!(classify_severity(0.99), ChangeSeverity::Low);
    }

    #[test]
    fn test_medium_severity() {
        assert_eq!(classify_severity(1.0), ChangeSeverity::Medium);
        assert_eq!(classify_severity(5.0), ChangeSeverity::Medium);
        assert_eq!(classify_severity(10.0), ChangeSeverity::Medium);
    }

    #[test]
    fn test_high_severity() {
        assert_eq!(classify_severity(10.1), ChangeSeverity::High);
        assert_eq!(classify_severity(50.0), ChangeSeverity::High);
        assert_eq!(classify_severity(100.0), ChangeSeverity::High);
    }
}
