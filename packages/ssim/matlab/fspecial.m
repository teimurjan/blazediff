function h = fspecial(type, varargin)
% FSPECIAL Create predefined 2-D filters
% Simplified version that only supports Gaussian filters for MS-SSIM
%
% H = FSPECIAL('gaussian', HSIZE, SIGMA) returns a rotationally
% symmetric Gaussian lowpass filter of size HSIZE with standard
% deviation SIGMA.

if ~strcmp(type, 'gaussian')
    error('Only gaussian filter type is supported');
end

if nargin < 2
    hsize = [3 3];
else
    hsize = varargin{1};
end

if nargin < 3
    sigma = 0.5;
else
    sigma = varargin{2};
end

% Make sure hsize is a 2-element vector
if length(hsize) == 1
    hsize = [hsize hsize];
end

% Create the Gaussian filter
siz = (hsize-1)/2;
[x,y] = meshgrid(-siz(2):siz(2), -siz(1):siz(1));
h = exp(-(x.^2 + y.^2) / (2*sigma^2));
h = h / sum(h(:));

end
