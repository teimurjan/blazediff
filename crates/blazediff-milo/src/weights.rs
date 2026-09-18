//! The trained MILO parameters, embedded and repacked for the kernels.
//!
//! `weights/milo.bin` is the authors' `MILO.pth` state_dict, tensor by tensor
//! in state_dict order, flattened to little-endian f32 with no header (see
//! `scripts/export-reference.py` for the export and the checkpoint's hash).
//! Keeping the blob in PyTorch's own layout means anyone can diff it against
//! the upstream checkpoint; the repack into the kernels' layout happens once,
//! at first use.
//!
//! The network is 44,930 parameters:
//!
//! | tensor                 | shape           |
//! |------------------------|-----------------|
//! | mask_finder conv 1     | 32 x 7 x 3 x 3  |
//! | mask_finder conv 2     | 64 x 32 x 3 x 3 |
//! | mask_finder conv 3     | 32 x 64 x 3 x 3 |
//! | mask_finder conv 4     | 16 x 32 x 3 x 3 |
//! | mask_finder conv 5     | 1 x 16 x 3 x 3  |
//! | scaler linear 1        | 32 x 1          |
//! | scaler linear 2        | 32 x 32         |
//! | scaler linear 3        | 1 x 32          |
//!
//! each followed by its bias.

use std::sync::OnceLock;

static BLOB: &[u8] = include_bytes!("weights/milo.bin");

/// Width of the scaler network's hidden layers.
pub(crate) const SCALER_WIDTH: usize = 32;

/// `(cout, cin)` of the five mask-finder convolutions, in order.
const CONV_SHAPES: [(usize, usize); 5] = [(32, 7), (64, 32), (32, 64), (16, 32), (1, 16)];

const fn conv_params((cout, cin): (usize, usize)) -> usize {
    cout * cin * 9 + cout
}

const PARAMS: usize = conv_params(CONV_SHAPES[0])
    + conv_params(CONV_SHAPES[1])
    + conv_params(CONV_SHAPES[2])
    + conv_params(CONV_SHAPES[3])
    + conv_params(CONV_SHAPES[4])
    + (SCALER_WIDTH + SCALER_WIDTH)
    + (SCALER_WIDTH * SCALER_WIDTH + SCALER_WIDTH)
    + (SCALER_WIDTH + 1);

const _: () = assert!(
    BLOB.len() == PARAMS * 4,
    "weights/milo.bin is not the MILO state_dict"
);

/// One 3x3 "same" convolution, repacked so a fixed `(tap, input channel)`
/// addresses a contiguous run of output channels.
pub(crate) struct Conv3x3 {
    pub cin: usize,
    pub cout: usize,
    /// `[tap][cin][cout]`, `tap = dy * 3 + dx`.
    pub weights: Vec<f32>,
    /// `[cout]`.
    pub bias: Vec<f32>,
}

/// The three-layer MLP that maps a raw masked error to the MOS scale, also
/// applied per pixel for the error map.
pub(crate) struct Scaler {
    pub w0: [f32; SCALER_WIDTH],
    pub b0: [f32; SCALER_WIDTH],
    /// `[out][in]`, as PyTorch stores it.
    pub w1: [[f32; SCALER_WIDTH]; SCALER_WIDTH],
    pub b1: [f32; SCALER_WIDTH],
    pub w2: [f32; SCALER_WIDTH],
    pub b2: f32,
}

pub(crate) struct Network {
    /// The four ReLU layers: 7 -> 32 -> 64 -> 32 -> 16.
    pub hidden: [Conv3x3; 4],
    /// The 16 -> 1 layer whose sigmoid is the mask residual.
    pub last: Conv3x3,
    pub scaler: Scaler,
}

/// Sequential reader over the blob.
struct Cursor<'a> {
    bytes: &'a [u8],
}

impl Cursor<'_> {
    fn take(&mut self, count: usize) -> Vec<f32> {
        let (head, tail) = self.bytes.split_at(count * 4);
        self.bytes = tail;
        head.chunks_exact(4)
            .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
            .collect()
    }

    fn take_array<const N: usize>(&mut self) -> [f32; N] {
        let values = self.take(N);
        std::array::from_fn(|i| values[i])
    }

    /// A conv weight in PyTorch's `[cout][cin][3][3]`, repacked to
    /// `[tap][cin][cout]`.
    fn take_conv(&mut self, (cout, cin): (usize, usize)) -> Conv3x3 {
        let torch = self.take(cout * cin * 9);
        let mut weights = vec![0.0; 9 * cin * cout];
        for co in 0..cout {
            for ci in 0..cin {
                for tap in 0..9 {
                    weights[(tap * cin + ci) * cout + co] = torch[(co * cin + ci) * 9 + tap];
                }
            }
        }
        let bias = self.take(cout);
        Conv3x3 {
            cin,
            cout,
            weights,
            bias,
        }
    }
}

fn parse() -> Network {
    let mut cursor = Cursor { bytes: BLOB };
    let mut convs = CONV_SHAPES.iter().map(|shape| cursor.take_conv(*shape));
    let hidden = std::array::from_fn(|_| convs.next().expect("four hidden layers"));
    let last = convs.next().expect("the output layer");

    let w0 = cursor.take_array();
    let b0 = cursor.take_array();
    let w1_flat = cursor.take(SCALER_WIDTH * SCALER_WIDTH);
    let w1 = std::array::from_fn(|k| std::array::from_fn(|j| w1_flat[k * SCALER_WIDTH + j]));
    let b1 = cursor.take_array();
    let w2 = cursor.take_array();
    let b2 = cursor.take(1)[0];
    debug_assert!(cursor.bytes.is_empty());

    Network {
        hidden,
        last,
        scaler: Scaler {
            w0,
            b0,
            w1,
            b1,
            w2,
            b2,
        },
    }
}

/// The parsed network, repacked on first use and shared by every call.
pub(crate) fn network() -> &'static Network {
    static NETWORK: OnceLock<Network> = OnceLock::new();
    NETWORK.get_or_init(parse)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_blob_parses_into_the_published_shapes() {
        let net = network();
        for (layer, (cout, cin)) in net.hidden.iter().zip(CONV_SHAPES) {
            assert_eq!((layer.cout, layer.cin), (cout, cin));
            assert_eq!(layer.weights.len(), 9 * cin * cout);
            assert_eq!(layer.bias.len(), cout);
        }
        assert_eq!((net.last.cout, net.last.cin), (1, 16));
    }

    #[test]
    fn the_repack_is_a_transpose_of_the_torch_layout() {
        // conv 1, torch index (co=3, ci=5, dy=2, dx=1) is the 3*7*9 + 5*9 + 7
        // th float of the blob.
        let torch_index = (3 * 7 + 5) * 9 + 7;
        let bytes = &BLOB[torch_index * 4..][..4];
        let expected = f32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
        let layer = &network().hidden[0];
        assert_eq!(layer.weights[(7 * 7 + 5) * 32 + 3], expected);
    }

    #[test]
    fn nothing_in_the_blob_is_nan_or_absurd() {
        let net = network();
        let all = net
            .hidden
            .iter()
            .chain(std::iter::once(&net.last))
            .flat_map(|layer| layer.weights.iter().chain(layer.bias.iter()));
        for value in all {
            assert!(value.is_finite() && value.abs() < 100.0, "{value}");
        }
    }
}
