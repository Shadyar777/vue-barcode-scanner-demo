// interface Point2D {
//   x: number;
//   y: number;
// }
// interface DetectedBarcode {
//   boundingBox?: DOMRectReadOnly
//   cornerPoints?: ReadonlyArray<Point2D>
//   format: string
//   rawValue: string
// }

// interface BarcodeDetectorOptions {
//   formats?: ReadonlyArray<string>
// }

// declare class BarcodeDetector {
//   constructor(options?: BarcodeDetectorOptions)
//   static getSupportedFormats(): Promise<string[]>
//   detect(image: ImageBitmapSource | HTMLVideoElement): Promise<DetectedBarcode[]>
// }


interface BarcodeDetector {
	detect(image: ImageBitmapSource): Promise<DetectedBarcode[]>;
}

type BarcodeFormat =
	| "aztec"
	| "code_128"
	| "code_39"
	| "code_93"
	| "codabar"
	| "data_matrix"
	| "ean_13"
	| "ean_8"
	| "itf"
	| "pdf417"
	| "qr_code"
	| "unknown"
	| "upc_a"
	| "upc_e";

interface BarcodeDetectorOptions {
	formats: BarcodeFormat[];
}

interface Point2D {
	x: number;
	y: number;
}

interface DetectedBarcode {
	readonly boundingBox: DOMRectReadOnly;
	rawValue: string;
	format: BarcodeFormat;
	cornerPoints: Point2D[];
}

interface BarcodeDetectorConstructor {
	/**
	 * A reference to the prototype.
	 */
	readonly prototype: BarcodeDetector;

	/**
	 * Creates a new BarcodeDetector.
	 */
	new (barcodeDetectorOptions?: BarcodeDetectorOptions): BarcodeDetector;

	static getSupportedFormats(): Promise<BarcodeFormat[]>;
}

declare var BarcodeDetector: BarcodeDetectorConstructor;