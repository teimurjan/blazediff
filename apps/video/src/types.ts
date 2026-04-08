export interface BoundingBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface ChangeRegion {
	bbox: BoundingBox;
	pixelCount: number;
	percentage: number;
	position: string;
	shape: string;
	changeType: string;
	confidence: number;
}

export interface InterpretResult {
	summary: string;
	totalRegions: number;
	regions: ChangeRegion[];
	severity: string;
	diffPercentage: number;
	width: number;
	height: number;
}
