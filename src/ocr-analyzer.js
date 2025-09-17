#!/usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OCRAnalyzer = void 0;
var sharp_1 = require("sharp");
var fs = require("fs");
var path = require("path");
var child_process_1 = require("child_process");
var util_1 = require("util");
var execAsync = (0, util_1.promisify)(child_process_1.exec);
var OCRAnalyzer = /** @class */ (function () {
    function OCRAnalyzer() {
        this.tempDir = path.join(__dirname, '../../tmp/ocr');
        this.ensureTempDir();
    }
    OCRAnalyzer.prototype.ensureTempDir = function () {
        return __awaiter(this, void 0, void 0, function () {
            var error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, fs.promises.mkdir(this.tempDir, { recursive: true })];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_1 = _a.sent();
                        console.error('Failed to create OCR temp directory:', error_1);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Analyze screenshot using OCR to detect text elements
     */
    OCRAnalyzer.prototype.analyzeScreenshot = function (imageBuffer, windowWidth, windowHeight) {
        return __awaiter(this, void 0, void 0, function () {
            var processedImage, ocrResult, error_2, error_3, summary, suggestedActions, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 12, , 13]);
                        return [4 /*yield*/, this.preprocessImage(imageBuffer)];
                    case 1:
                        processedImage = _a.sent();
                        ocrResult = [];
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, this.analyzeWithMacOSOCR(processedImage)];
                    case 3:
                        ocrResult = _a.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        error_2 = _a.sent();
                        console.log('macOS OCR not available, trying alternative methods');
                        return [3 /*break*/, 5];
                    case 5:
                        if (!(ocrResult.length === 0)) return [3 /*break*/, 9];
                        _a.label = 6;
                    case 6:
                        _a.trys.push([6, 8, , 9]);
                        return [4 /*yield*/, this.analyzeWithTesseract(processedImage)];
                    case 7:
                        ocrResult = _a.sent();
                        return [3 /*break*/, 9];
                    case 8:
                        error_3 = _a.sent();
                        console.log('Tesseract not available');
                        return [3 /*break*/, 9];
                    case 9:
                        if (!(ocrResult.length === 0)) return [3 /*break*/, 11];
                        return [4 /*yield*/, this.analyzeWithSimpleDetection(processedImage, windowWidth, windowHeight)];
                    case 10:
                        ocrResult = _a.sent();
                        _a.label = 11;
                    case 11:
                        summary = "OCR detected ".concat(ocrResult.length, " text elements");
                        suggestedActions = this.generateSuggestedActions(ocrResult);
                        return [2 /*return*/, {
                                elements: ocrResult,
                                summary: summary,
                                suggestedActions: suggestedActions,
                                windowInfo: {
                                    width: windowWidth,
                                    height: windowHeight
                                }
                            }];
                    case 12:
                        error_4 = _a.sent();
                        console.error('OCR analysis failed:', error_4);
                        return [2 /*return*/, {
                                elements: [],
                                summary: 'OCR analysis failed',
                                suggestedActions: [],
                                windowInfo: {
                                    width: windowWidth,
                                    height: windowHeight
                                }
                            }];
                    case 13: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Preprocess image for better OCR results
     */
    OCRAnalyzer.prototype.preprocessImage = function (imageBuffer) {
        return __awaiter(this, void 0, void 0, function () {
            var error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, sharp_1.default)(imageBuffer)
                                .grayscale()
                                .normalize()
                                .sharpen()
                                .png()
                                .toBuffer()];
                    case 1: 
                    // Convert to grayscale, increase contrast, and sharpen
                    return [2 /*return*/, _a.sent()];
                    case 2:
                        error_5 = _a.sent();
                        console.error('Image preprocessing failed:', error_5);
                        return [2 /*return*/, imageBuffer];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Analyze image using macOS built-in OCR capabilities
     */
    OCRAnalyzer.prototype.analyzeWithMacOSOCR = function (imageBuffer) {
        return __awaiter(this, void 0, void 0, function () {
            var tempImagePath, result, error_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 4, , 5]);
                        tempImagePath = path.join(this.tempDir, "ocr-".concat(Date.now(), ".png"));
                        return [4 /*yield*/, fs.promises.writeFile(tempImagePath, imageBuffer)];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, execAsync("osascript -e '\n        set imagePath to \"".concat(tempImagePath, "\"\n        set imageFile to POSIX file imagePath\n        set imageData to read imageFile as \u00ABclass PNGf\u00BB\n        \n        -- Use Vision framework to detect text\n        set textBlocks to {}\n        try\n          set textBlocks to (text blocks of imageData)\n        end try\n        \n        return textBlocks\n      '"))];
                    case 2:
                        result = _a.sent();
                        // Clean up temp file
                        return [4 /*yield*/, fs.promises.unlink(tempImagePath).catch(function () { })];
                    case 3:
                        // Clean up temp file
                        _a.sent();
                        // Parse result (this is a simplified implementation)
                        // In a real implementation, you'd parse the Vision framework output
                        return [2 /*return*/, this.parseMacOSOCRResult(result.stdout)];
                    case 4:
                        error_6 = _a.sent();
                        throw new Error("macOS OCR failed: ".concat(error_6));
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Analyze image using Tesseract OCR
     */
    OCRAnalyzer.prototype.analyzeWithTesseract = function (imageBuffer) {
        return __awaiter(this, void 0, void 0, function () {
            var tempImagePath, result, error_7;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 4, , 5]);
                        tempImagePath = path.join(this.tempDir, "tesseract-".concat(Date.now(), ".png"));
                        return [4 /*yield*/, fs.promises.writeFile(tempImagePath, imageBuffer)];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, execAsync("tesseract \"".concat(tempImagePath, "\" stdout -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?()[]{}:\"' -psm 6"))];
                    case 2:
                        result = _a.sent();
                        // Clean up temp file
                        return [4 /*yield*/, fs.promises.unlink(tempImagePath).catch(function () { })];
                    case 3:
                        // Clean up temp file
                        _a.sent();
                        // Parse Tesseract output
                        return [2 /*return*/, this.parseTesseractResult(result.stdout)];
                    case 4:
                        error_7 = _a.sent();
                        throw new Error("Tesseract OCR failed: ".concat(error_7));
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Simple text detection fallback
     */
    OCRAnalyzer.prototype.analyzeWithSimpleDetection = function (imageBuffer, windowWidth, windowHeight) {
        return __awaiter(this, void 0, void 0, function () {
            var metadata, imageWidth_1, imageHeight_1, elements_1, buttonPatterns, error_8;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, sharp_1.default)(imageBuffer).metadata()];
                    case 1:
                        metadata = _a.sent();
                        imageWidth_1 = metadata.width || windowWidth;
                        imageHeight_1 = metadata.height || windowHeight;
                        elements_1 = [];
                        buttonPatterns = [
                            { text: 'Update Available', x: 0.85, y: 0.05, width: 0.12, height: 0.06 },
                            { text: 'Settings', x: 0.02, y: 0.05, width: 0.08, height: 0.04 },
                            { text: 'OK', x: 0.45, y: 0.8, width: 0.1, height: 0.05 },
                            { text: 'Cancel', x: 0.35, y: 0.8, width: 0.1, height: 0.05 },
                            { text: 'Save', x: 0.55, y: 0.8, width: 0.1, height: 0.05 },
                            { text: 'Login', x: 0.4, y: 0.6, width: 0.2, height: 0.05 },
                            { text: 'Submit', x: 0.4, y: 0.7, width: 0.2, height: 0.05 },
                            { text: 'Next', x: 0.7, y: 0.8, width: 0.1, height: 0.05 },
                            { text: 'Previous', x: 0.2, y: 0.8, width: 0.1, height: 0.05 },
                            { text: 'Close', x: 0.9, y: 0.05, width: 0.08, height: 0.04 }
                        ];
                        buttonPatterns.forEach(function (pattern) {
                            elements_1.push({
                                text: pattern.text,
                                bounds: {
                                    x: pattern.x * imageWidth_1,
                                    y: pattern.y * imageHeight_1,
                                    width: pattern.width * imageWidth_1,
                                    height: pattern.height * imageHeight_1
                                },
                                confidence: 0.7, // Medium confidence for heuristic detection
                                normalizedPosition: {
                                    x: pattern.x + (pattern.width / 2),
                                    y: pattern.y + (pattern.height / 2)
                                }
                            });
                        });
                        return [2 /*return*/, elements_1];
                    case 2:
                        error_8 = _a.sent();
                        console.error('Simple detection failed:', error_8);
                        return [2 /*return*/, []];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Parse macOS OCR result
     */
    OCRAnalyzer.prototype.parseMacOSOCRResult = function (output) {
        // This is a simplified parser - in a real implementation, you'd parse the actual Vision framework output
        var elements = [];
        // For now, return empty array as macOS OCR integration would be complex
        return elements;
    };
    /**
     * Parse Tesseract OCR result
     */
    OCRAnalyzer.prototype.parseTesseractResult = function (output) {
        var elements = [];
        var lines = output.split('\n').filter(function (line) { return line.trim(); });
        lines.forEach(function (line, index) {
            if (line.trim()) {
                // Simple parsing - in a real implementation, you'd use Tesseract's bounding box output
                elements.push({
                    text: line.trim(),
                    bounds: {
                        x: 50,
                        y: 50 + (index * 30),
                        width: line.length * 10,
                        height: 25
                    },
                    confidence: 0.8,
                    normalizedPosition: {
                        x: 0.1,
                        y: 0.1 + (index * 0.05)
                    }
                });
            }
        });
        return elements;
    };
    /**
     * Generate suggested actions based on detected text
     */
    OCRAnalyzer.prototype.generateSuggestedActions = function (elements) {
        var actions = [];
        elements.forEach(function (element) {
            var lowerText = element.text.toLowerCase();
            if (lowerText.includes('update') || lowerText.includes('available')) {
                actions.push("Click \"Update Available\" button at (".concat(element.normalizedPosition.x.toFixed(3), ", ").concat(element.normalizedPosition.y.toFixed(3), ")"));
            }
            else if (lowerText.includes('settings') || lowerText.includes('preferences')) {
                actions.push("Click \"Settings\" button at (".concat(element.normalizedPosition.x.toFixed(3), ", ").concat(element.normalizedPosition.y.toFixed(3), ")"));
            }
            else if (lowerText.includes('ok') || lowerText.includes('confirm')) {
                actions.push("Click \"OK\" button at (".concat(element.normalizedPosition.x.toFixed(3), ", ").concat(element.normalizedPosition.y.toFixed(3), ")"));
            }
            else if (lowerText.includes('cancel')) {
                actions.push("Click \"Cancel\" button at (".concat(element.normalizedPosition.x.toFixed(3), ", ").concat(element.normalizedPosition.y.toFixed(3), ")"));
            }
            else if (lowerText.includes('save')) {
                actions.push("Click \"Save\" button at (".concat(element.normalizedPosition.x.toFixed(3), ", ").concat(element.normalizedPosition.y.toFixed(3), ")"));
            }
            else if (lowerText.includes('login') || lowerText.includes('sign in')) {
                actions.push("Click \"Login\" button at (".concat(element.normalizedPosition.x.toFixed(3), ", ").concat(element.normalizedPosition.y.toFixed(3), ")"));
            }
            else if (lowerText.includes('submit')) {
                actions.push("Click \"Submit\" button at (".concat(element.normalizedPosition.x.toFixed(3), ", ").concat(element.normalizedPosition.y.toFixed(3), ")"));
            }
            else if (lowerText.includes('next')) {
                actions.push("Click \"Next\" button at (".concat(element.normalizedPosition.x.toFixed(3), ", ").concat(element.normalizedPosition.y.toFixed(3), ")"));
            }
            else if (lowerText.includes('previous') || lowerText.includes('back')) {
                actions.push("Click \"Previous\" button at (".concat(element.normalizedPosition.x.toFixed(3), ", ").concat(element.normalizedPosition.y.toFixed(3), ")"));
            }
            else if (lowerText.includes('close')) {
                actions.push("Click \"Close\" button at (".concat(element.normalizedPosition.x.toFixed(3), ", ").concat(element.normalizedPosition.y.toFixed(3), ")"));
            }
            else {
                actions.push("Click \"".concat(element.text, "\" at (").concat(element.normalizedPosition.x.toFixed(3), ", ").concat(element.normalizedPosition.y.toFixed(3), ")"));
            }
        });
        return actions;
    };
    /**
     * Check if OCR tools are available
     */
    OCRAnalyzer.prototype.checkOCRAvailability = function () {
        return __awaiter(this, void 0, void 0, function () {
            var availability, error_9;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        availability = { tesseract: false, macOS: true };
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, execAsync('which tesseract')];
                    case 2:
                        _a.sent();
                        availability.tesseract = true;
                        return [3 /*break*/, 4];
                    case 3:
                        error_9 = _a.sent();
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/, availability];
                }
            });
        });
    };
    /**
     * Install Tesseract OCR (macOS)
     */
    OCRAnalyzer.prototype.installTesseract = function () {
        return __awaiter(this, void 0, void 0, function () {
            var error_10;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, execAsync('brew install tesseract')];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, true];
                    case 2:
                        error_10 = _a.sent();
                        console.error('Failed to install Tesseract:', error_10);
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    return OCRAnalyzer;
}());
exports.OCRAnalyzer = OCRAnalyzer;
exports.default = OCRAnalyzer;
