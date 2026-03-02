export {}

declare global {
  type BarcodeFormat =
    | 'aztec'
    | 'code_128'
    | 'code_39'
    | 'code_93'
    | 'codabar'
    | 'data_matrix'
    | 'ean_13'
    | 'ean_8'
    | 'itf'
    | 'pdf417'
    | 'qr_code'
    | 'unknown'
    | 'upc_a'
    | 'upc_e'

  interface BarcodeDetectorOptions {
    formats?: BarcodeFormat[]
  }

  interface Point2D {
    readonly x: number
    readonly y: number
  }

  interface DetectedBarcode {
    readonly boundingBox?: DOMRectReadOnly
    readonly cornerPoints?: Point2D[]
    readonly format: BarcodeFormat
    readonly rawValue: string
  }

  interface BarcodeDetector {
    detect(image: ImageBitmapSource | HTMLVideoElement): Promise<DetectedBarcode[]>
  }

  interface BarcodeDetectorConstructor {
    readonly prototype: BarcodeDetector
    new (options?: BarcodeDetectorOptions): BarcodeDetector
    getSupportedFormats(): Promise<BarcodeFormat[]>
  }

  var BarcodeDetector: BarcodeDetectorConstructor
}
