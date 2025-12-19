// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "MouseCalibration",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "MouseCalibration", targets: ["MouseCalibration"])
    ],
    targets: [
        .executableTarget(
            name: "MouseCalibration",
            path: "MouseCalibration"
        )
    ]
)
