// Cut the main subject out of a photo (any object: insect, food, product, person) with Apple Vision,
// on-device (macOS 14+, same engine as "Lift subject from background"). Writes an RGBA PNG cropped to
// the subject. Falls back to the person matte if no foreground object is found.
// Usage: swift 07_Scripts/paper_doc/subject_cutout.swift <in_image> <out.png>
import Foundation
import Vision
import CoreImage
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count == 3 else { print("usage: subject_cutout.swift IN OUT.png"); exit(1) }
let inURL = URL(fileURLWithPath: args[1]), outURL = URL(fileURLWithPath: args[2])
guard let src = CIImage(contentsOf: inURL, options: [.applyOrientationProperty: true]) else {
    print("cannot read", args[1]); exit(1)
}
let handler = VNImageRequestHandler(ciImage: src, options: [:])
var mask: CIImage? = nil

let fg = VNGenerateForegroundInstanceMaskRequest()
try handler.perform([fg])
if let obs = fg.results?.first, !obs.allInstances.isEmpty {
    let buf = try obs.generateScaledMaskForImage(forInstances: obs.allInstances, from: handler)
    mask = CIImage(cvPixelBuffer: buf)
} else {
    let person = VNGeneratePersonSegmentationRequest()
    person.qualityLevel = .accurate
    person.outputPixelFormat = kCVPixelFormatType_OneComponent8
    try handler.perform([person])
    if let buf = person.results?.first?.pixelBuffer {
        var m = CIImage(cvPixelBuffer: buf)
        m = m.transformed(by: CGAffineTransform(scaleX: src.extent.width / m.extent.width,
                                                y: src.extent.height / m.extent.height))
        mask = m
    }
}
guard let m = mask else { print("no subject found"); exit(2) }

let blend = CIFilter(name: "CIBlendWithMask")!
blend.setValue(src, forKey: kCIInputImageKey)
blend.setValue(CIImage.empty(), forKey: kCIInputBackgroundImageKey)
blend.setValue(m, forKey: kCIInputMaskImageKey)
let out = blend.outputImage!.cropped(to: src.extent)

let ctx = CIContext()
guard let cg = ctx.createCGImage(out, from: src.extent, format: .RGBA8,
                                 colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!) else { exit(3) }
let dest = CGImageDestinationCreateWithURL(outURL as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, cg, nil)
CGImageDestinationFinalize(dest)
print("cutout:", outURL.path)
