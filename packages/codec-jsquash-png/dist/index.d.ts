interface Image {
	data: Buffer | Uint8Array | Uint8ClampedArray;
	width: number;
	height: number;
}
declare function read(input: string | Buffer): Promise<Image>;
declare function write(image: Image, output: string | Buffer): Promise<void>;
declare const codecJsquashPng: {
	read: typeof read;
	write: typeof write;
};

export { type Image, codecJsquashPng, codecJsquashPng as default };
