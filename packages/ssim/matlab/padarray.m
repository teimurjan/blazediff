function B = padarray(A, padsize, varargin)
% PADARRAY Pad array
% Simplified version for MS-SSIM
%
% B = PADARRAY(A, PADSIZE) pads array A with zeros
% B = PADARRAY(A, PADSIZE, PADVAL) pads array A with PADVAL
% B = PADARRAY(A, PADSIZE, 'symmetric') pads array A with mirror reflection
% B = PADARRAY(A, PADSIZE, 'replicate') pads array A with edge values
% B = PADARRAY(A, PADSIZE, 'circular') pads array A with circular repetition

[m, n] = size(A);
pad_m = padsize(1);
pad_n = padsize(2);

% Determine padding method
if nargin < 3
    padval = 0;
    method = 'constant';
elseif isnumeric(varargin{1})
    padval = varargin{1};
    method = 'constant';
else
    method = varargin{1};
    padval = 0;
end

% Create output array
B = zeros(m + 2*pad_m, n + 2*pad_n);

% Copy original array to center
B(pad_m+1:pad_m+m, pad_n+1:pad_n+n) = A;

if strcmp(method, 'constant')
    % Fill with constant value (default is 0, already done)
    if padval ~= 0
        B(1:pad_m, :) = padval;
        B(end-pad_m+1:end, :) = padval;
        B(:, 1:pad_n) = padval;
        B(:, end-pad_n+1:end) = padval;
    end

elseif strcmp(method, 'symmetric')
    % Symmetric (mirror) padding
    % Top
    for i = 1:pad_m
        B(pad_m+1-i, pad_n+1:pad_n+n) = A(min(i+1, m), :);
    end
    % Bottom
    for i = 1:pad_m
        B(pad_m+m+i, pad_n+1:pad_n+n) = A(max(m-i, 1), :);
    end
    % Left (including corners)
    for j = 1:pad_n
        B(:, pad_n+1-j) = B(:, pad_n+min(j+1, n));
    end
    % Right (including corners)
    for j = 1:pad_n
        B(:, pad_n+n+j) = B(:, pad_n+max(n-j, 1));
    end

elseif strcmp(method, 'replicate')
    % Replicate edge values
    % Top
    for i = 1:pad_m
        B(i, pad_n+1:pad_n+n) = A(1, :);
    end
    % Bottom
    for i = 1:pad_m
        B(pad_m+m+i, pad_n+1:pad_n+n) = A(m, :);
    end
    % Left
    for j = 1:pad_n
        B(:, j) = B(:, pad_n+1);
    end
    % Right
    for j = 1:pad_n
        B(:, pad_n+n+j) = B(:, pad_n+n);
    end

elseif strcmp(method, 'circular')
    % Circular padding
    % Top
    for i = 1:pad_m
        idx = mod(m - i, m) + 1;
        B(pad_m+1-i, pad_n+1:pad_n+n) = A(idx, :);
    end
    % Bottom
    for i = 1:pad_m
        idx = mod(i - 1, m) + 1;
        B(pad_m+m+i, pad_n+1:pad_n+n) = A(idx, :);
    end
    % Left (including corners)
    for j = 1:pad_n
        idx = mod(n - j, n) + 1;
        B(:, pad_n+1-j) = B(:, pad_n+idx);
    end
    % Right (including corners)
    for j = 1:pad_n
        idx = mod(j - 1, n) + 1;
        B(:, pad_n+n+j) = B(:, pad_n+idx);
    end
end

end
