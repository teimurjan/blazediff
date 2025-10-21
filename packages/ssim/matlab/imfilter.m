function B = imfilter(A, H, varargin)
% IMFILTER N-D filtering of multidimensional images
% Simplified version for MS-SSIM that supports symmetric padding
%
% B = IMFILTER(A, H, 'symmetric', 'same') filters the image A with the
% filter H using symmetric boundary padding and returns the result the
% same size as A.

% Parse optional arguments
padding = 'zeros';
output_size = 'same';

for i = 1:length(varargin)
    arg = varargin{i};
    if ischar(arg)
        if strcmp(arg, 'symmetric') || strcmp(arg, 'replicate') || strcmp(arg, 'circular')
            padding = arg;
        elseif strcmp(arg, 'same') || strcmp(arg, 'full')
            output_size = arg;
        end
    end
end

% Get dimensions
[m, n] = size(A);
[hm, hn] = size(H);

% Calculate padding size
pad_m = floor(hm / 2);
pad_n = floor(hn / 2);

% Pad the image
if strcmp(padding, 'symmetric')
    % Symmetric padding (reflect)
    A_padded = padarray(A, [pad_m, pad_n], 'symmetric');
elseif strcmp(padding, 'replicate')
    % Replicate padding
    A_padded = padarray(A, [pad_m, pad_n], 'replicate');
elseif strcmp(padding, 'circular')
    % Circular padding
    A_padded = padarray(A, [pad_m, pad_n], 'circular');
else
    % Zero padding (default)
    A_padded = padarray(A, [pad_m, pad_n], 0);
end

% Perform 2D convolution
B_full = conv2(A_padded, H, 'valid');

% Return based on output_size
if strcmp(output_size, 'same')
    % Extract the center part to match input size
    start_m = 1;
    start_n = 1;
    end_m = m;
    end_n = n;

    % Handle even-sized filters
    if mod(hm, 2) == 0
        start_m = start_m + 1;
    end
    if mod(hn, 2) == 0
        start_n = start_n + 1;
    end

    B = B_full(start_m:end_m, start_n:end_n);
else
    B = B_full;
end

end
