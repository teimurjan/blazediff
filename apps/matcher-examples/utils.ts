export function createTestImage(
	width: number,
	height: number,
	color: [number, number, number, number] = [128, 128, 128, 255],
): { data: Uint8Array; width: number; height: number } {
	const data = new Uint8Array(width * height * 4);
	for (let i = 0; i < width * height; i++) {
		data[i * 4] = color[0];
		data[i * 4 + 1] = color[1];
		data[i * 4 + 2] = color[2];
		data[i * 4 + 3] = color[3];
	}
	return { data, width, height };
}
