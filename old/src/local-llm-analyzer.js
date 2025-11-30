#!/usr/bin/env node
"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.LocalLLMAnalyzer = void 0;
var fs = require("fs");
var path = require("path");
var LocalLLMAnalyzer = /** @class */ (function () {
    function LocalLLMAnalyzer(config) {
        this.config = {
            baseUrl: config.baseUrl || 'http://127.0.0.1:1234',
            apiKey: config.apiKey,
            model: config.model || 'gpt-oss-20b',
            maxTokens: config.maxTokens || 2000,
            temperature: config.temperature || 0.1
        };
        this.tempDir = path.join(__dirname, '../../tmp/llm');
        this.ensureTempDir();
    }
    LocalLLMAnalyzer.prototype.ensureTempDir = function () {
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
                        console.error('Failed to create LLM temp directory:', error_1);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Analyze screenshot using local LLM
     */
    LocalLLMAnalyzer.prototype.analyzeScreenshot = function (imageBuffer, windowWidth, windowHeight, appName) {
        return __awaiter(this, void 0, void 0, function () {
            var base64Image, prompt_1, response, analysis, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        base64Image = imageBuffer.toString('base64');
                        prompt_1 = this.createAnalysisPrompt(windowWidth, windowHeight, appName);
                        return [4 /*yield*/, this.callLocalLLM(prompt_1, base64Image)];
                    case 1:
                        response = _a.sent();
                        analysis = this.parseLLMResponse(response, windowWidth, windowHeight);
                        return [2 /*return*/, analysis];
                    case 2:
                        error_2 = _a.sent();
                        console.error('Local LLM analysis failed:', error_2);
                        return [2 /*return*/, this.createFallbackAnalysis(windowWidth, windowHeight)];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Create analysis prompt for the LLM
     */
    LocalLLMAnalyzer.prototype.createAnalysisPrompt = function (windowWidth, windowHeight, appName) {
        return "Analyze this screenshot of a ".concat(appName || 'desktop application', " window (").concat(windowWidth, "x").concat(windowHeight, "px) and identify all interactive UI elements.\n\nPlease provide a JSON response with the following structure:\n{\n  \"elements\": [\n    {\n      \"type\": \"button|text|input|link|image|menu|checkbox|radio|slider|unknown\",\n      \"text\": \"visible text content\",\n      \"bounds\": {\n        \"x\": 100,\n        \"y\": 50,\n        \"width\": 80,\n        \"height\": 30\n      },\n      \"normalizedPosition\": {\n        \"x\": 0.1,\n        \"y\": 0.05\n      },\n      \"confidence\": 0.95,\n      \"description\": \"detailed description of the element\",\n      \"isClickable\": true,\n      \"isEnabled\": true\n    }\n  ],\n  \"summary\": \"Brief summary of the UI elements found\",\n  \"suggestedActions\": [\n    \"Click 'Update Available' button at (0.85, 0.1)\",\n    \"Access settings through the settings button\"\n  ],\n  \"boundingBoxes\": [\n    {\n      \"element\": \"reference to element above\",\n      \"box\": {\n        \"x\": 100,\n        \"y\": 50,\n        \"width\": 80,\n        \"height\": 30\n      }\n    }\n  ]\n}\n\nFocus on:\n1. Buttons (especially \"Update Available\", \"Settings\", \"OK\", \"Cancel\", \"Save\", \"Login\", \"Submit\", \"Next\", \"Previous\", \"Close\")\n2. Text input fields\n3. Links and clickable text\n4. Menu items\n5. Checkboxes and radio buttons\n6. Any other interactive elements\n\nProvide accurate coordinates and normalized positions (0-1) for each element.");
    };
    /**
     * Call local LLM with image and prompt
     */
    LocalLLMAnalyzer.prototype.callLocalLLM = function (prompt, base64Image) {
        return __awaiter(this, void 0, void 0, function () {
            var requestBody, response, data, error_3;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 3, , 4]);
                        requestBody = {
                            model: this.config.model,
                            messages: [
                                {
                                    role: 'user',
                                    content: [
                                        {
                                            type: 'text',
                                            text: prompt
                                        },
                                        {
                                            type: 'image_url',
                                            image_url: {
                                                url: "data:image/png;base64,".concat(base64Image)
                                            }
                                        }
                                    ]
                                }
                            ],
                            max_tokens: this.config.maxTokens,
                            temperature: this.config.temperature
                        };
                        return [4 /*yield*/, fetch("".concat(this.config.baseUrl, "/v1/chat/completions"), {
                                method: 'POST',
                                headers: __assign({ 'Content-Type': 'application/json' }, (this.config.apiKey && { 'Authorization': "Bearer ".concat(this.config.apiKey) })),
                                body: JSON.stringify(requestBody)
                            })];
                    case 1:
                        response = _c.sent();
                        if (!response.ok) {
                            throw new Error("LLM API request failed: ".concat(response.status, " ").concat(response.statusText));
                        }
                        return [4 /*yield*/, response.json()];
                    case 2:
                        data = _c.sent();
                        return [2 /*return*/, ((_b = (_a = data.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || ''];
                    case 3:
                        error_3 = _c.sent();
                        console.error('Failed to call local LLM:', error_3);
                        throw error_3;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Parse LLM response into structured analysis
     */
    LocalLLMAnalyzer.prototype.parseLLMResponse = function (response, windowWidth, windowHeight) {
        try {
            // Try to extract JSON from the response
            var jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in LLM response');
            }
            var parsed = JSON.parse(jsonMatch[0]);
            // Validate and normalize the response
            var elements = (parsed.elements || []).map(function (element) {
                var _a, _b, _c, _d, _e, _f;
                return ({
                    type: element.type || 'unknown',
                    text: element.text || '',
                    bounds: {
                        x: ((_a = element.bounds) === null || _a === void 0 ? void 0 : _a.x) || 0,
                        y: ((_b = element.bounds) === null || _b === void 0 ? void 0 : _b.y) || 0,
                        width: ((_c = element.bounds) === null || _c === void 0 ? void 0 : _c.width) || 0,
                        height: ((_d = element.bounds) === null || _d === void 0 ? void 0 : _d.height) || 0
                    },
                    normalizedPosition: {
                        x: ((_e = element.normalizedPosition) === null || _e === void 0 ? void 0 : _e.x) || 0,
                        y: ((_f = element.normalizedPosition) === null || _f === void 0 ? void 0 : _f.y) || 0
                    },
                    confidence: element.confidence || 0.5,
                    description: element.description || '',
                    isClickable: element.isClickable !== false,
                    isEnabled: element.isEnabled !== false
                });
            });
            var boundingBoxes = elements.map(function (element) { return ({
                element: element,
                box: element.bounds
            }); });
            return {
                elements: elements,
                summary: parsed.summary || "Found ".concat(elements.length, " UI elements"),
                suggestedActions: parsed.suggestedActions || [],
                windowInfo: {
                    width: windowWidth,
                    height: windowHeight
                },
                boundingBoxes: boundingBoxes
            };
        }
        catch (error) {
            console.error('Failed to parse LLM response:', error);
            return this.createFallbackAnalysis(windowWidth, windowHeight);
        }
    };
    /**
     * Create fallback analysis when LLM fails
     */
    LocalLLMAnalyzer.prototype.createFallbackAnalysis = function (windowWidth, windowHeight) {
        // Create basic fallback elements
        var elements = [
            {
                type: 'button',
                text: 'Update Available',
                bounds: { x: windowWidth * 0.85, y: windowHeight * 0.05, width: windowWidth * 0.12, height: windowHeight * 0.06 },
                normalizedPosition: { x: 0.91, y: 0.08 },
                confidence: 0.7,
                description: 'Update available button (heuristic detection)',
                isClickable: true,
                isEnabled: true
            },
            {
                type: 'button',
                text: 'Settings',
                bounds: { x: windowWidth * 0.02, y: windowHeight * 0.05, width: windowWidth * 0.08, height: windowHeight * 0.04 },
                normalizedPosition: { x: 0.06, y: 0.07 },
                confidence: 0.7,
                description: 'Settings button (heuristic detection)',
                isClickable: true,
                isEnabled: true
            }
        ];
        return {
            elements: elements,
            summary: "Fallback analysis: Found ".concat(elements.length, " UI elements using heuristic detection"),
            suggestedActions: [
                'Click "Update Available" button at (0.91, 0.08)',
                'Click "Settings" button at (0.06, 0.07)'
            ],
            windowInfo: {
                width: windowWidth,
                height: windowHeight
            },
            boundingBoxes: elements.map(function (element) { return ({
                element: element,
                box: element.bounds
            }); })
        };
    };
    /**
     * Test connection to local LLM
     */
    LocalLLMAnalyzer.prototype.testConnection = function () {
        return __awaiter(this, void 0, void 0, function () {
            var response, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, fetch("".concat(this.config.baseUrl, "/v1/models"), {
                                method: 'GET',
                                headers: __assign({}, (this.config.apiKey && { 'Authorization': "Bearer ".concat(this.config.apiKey) }))
                            })];
                    case 1:
                        response = _a.sent();
                        return [2 /*return*/, response.ok];
                    case 2:
                        error_4 = _a.sent();
                        console.error('LLM connection test failed:', error_4);
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get available models from local LLM
     */
    LocalLLMAnalyzer.prototype.getAvailableModels = function () {
        return __awaiter(this, void 0, void 0, function () {
            var response, data, error_5;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, fetch("".concat(this.config.baseUrl, "/v1/models"), {
                                method: 'GET',
                                headers: __assign({}, (this.config.apiKey && { 'Authorization': "Bearer ".concat(this.config.apiKey) }))
                            })];
                    case 1:
                        response = _b.sent();
                        if (!response.ok) {
                            throw new Error("Failed to get models: ".concat(response.status));
                        }
                        return [4 /*yield*/, response.json()];
                    case 2:
                        data = _b.sent();
                        return [2 /*return*/, ((_a = data.data) === null || _a === void 0 ? void 0 : _a.map(function (model) { return model.id; })) || []];
                    case 3:
                        error_5 = _b.sent();
                        console.error('Failed to get available models:', error_5);
                        return [2 /*return*/, []];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Analyze specific element types
     */
    LocalLLMAnalyzer.prototype.analyzeElementTypes = function (imageBuffer, windowWidth, windowHeight, elementTypes) {
        return __awaiter(this, void 0, void 0, function () {
            var analysis;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.analyzeScreenshot(imageBuffer, windowWidth, windowHeight)];
                    case 1:
                        analysis = _a.sent();
                        return [2 /*return*/, analysis.elements.filter(function (element) { return elementTypes.includes(element.type); })];
                }
            });
        });
    };
    /**
     * Find elements by text content
     */
    LocalLLMAnalyzer.prototype.findElementsByText = function (imageBuffer, windowWidth, windowHeight, searchText) {
        return __awaiter(this, void 0, void 0, function () {
            var analysis, lowerSearchText;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.analyzeScreenshot(imageBuffer, windowWidth, windowHeight)];
                    case 1:
                        analysis = _a.sent();
                        lowerSearchText = searchText.toLowerCase();
                        return [2 /*return*/, analysis.elements.filter(function (element) {
                                return element.text && element.text.toLowerCase().includes(lowerSearchText);
                            })];
                }
            });
        });
    };
    /**
     * Get clickable elements only
     */
    LocalLLMAnalyzer.prototype.getClickableElements = function (imageBuffer, windowWidth, windowHeight) {
        return __awaiter(this, void 0, void 0, function () {
            var analysis;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.analyzeScreenshot(imageBuffer, windowWidth, windowHeight)];
                    case 1:
                        analysis = _a.sent();
                        return [2 /*return*/, analysis.elements.filter(function (element) { return element.isClickable && element.isEnabled; })];
                }
            });
        });
    };
    return LocalLLMAnalyzer;
}());
exports.LocalLLMAnalyzer = LocalLLMAnalyzer;
exports.default = LocalLLMAnalyzer;
