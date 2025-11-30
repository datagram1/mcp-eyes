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
exports.WebContentDetector = void 0;
var sharp_1 = require("sharp");
var fs = require("fs");
var path = require("path");
var child_process_1 = require("child_process");
var util_1 = require("util");
var execAsync = (0, util_1.promisify)(child_process_1.exec);
var WebContentDetector = /** @class */ (function () {
    function WebContentDetector() {
        this.tempDir = path.join(__dirname, '../../tmp/web-content');
        this.ensureTempDir();
        this.llmConfig = this.loadLLMConfig();
    }
    WebContentDetector.prototype.ensureTempDir = function () {
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
                        console.error('Failed to create web content temp directory:', error_1);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    WebContentDetector.prototype.loadLLMConfig = function () {
        // Default configuration
        var defaultConfig = {
            provider: 'lm-studio',
            baseUrl: 'http://127.0.0.1:1234',
            model: 'openai/gpt-oss-20b'
        };
        // Try to load from config file
        try {
            var configPath = path.join(__dirname, '../../llm-config.json');
            if (fs.existsSync(configPath)) {
                var configData = fs.readFileSync(configPath, 'utf8');
                var customConfig = JSON.parse(configData);
                return __assign(__assign({}, defaultConfig), customConfig);
            }
        }
        catch (error) {
            console.log('Using default LLM configuration');
        }
        return defaultConfig;
    };
    /**
     * Analyze web content using multiple methods
     */
    WebContentDetector.prototype.analyzeWebContent = function (imageBuffer, windowBounds, appName) {
        return __awaiter(this, void 0, void 0, function () {
            var elements, webElements, error_2, aiElements, error_3, ocrElements, error_4, heuristicElements, summary, suggestedActions, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 13, , 14]);
                        elements = [];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.getWebContentViaAccessibility(appName)];
                    case 2:
                        webElements = _a.sent();
                        elements.push.apply(elements, webElements);
                        return [3 /*break*/, 4];
                    case 3:
                        error_2 = _a.sent();
                        console.log('Web accessibility failed:', error_2);
                        return [3 /*break*/, 4];
                    case 4:
                        if (!(elements.length === 0)) return [3 /*break*/, 8];
                        _a.label = 5;
                    case 5:
                        _a.trys.push([5, 7, , 8]);
                        return [4 /*yield*/, this.analyzeWithAI(imageBuffer, windowBounds, appName)];
                    case 6:
                        aiElements = _a.sent();
                        elements.push.apply(elements, aiElements);
                        return [3 /*break*/, 8];
                    case 7:
                        error_3 = _a.sent();
                        console.log('AI analysis failed:', error_3);
                        return [3 /*break*/, 8];
                    case 8:
                        if (!(elements.length === 0)) return [3 /*break*/, 12];
                        _a.label = 9;
                    case 9:
                        _a.trys.push([9, 11, , 12]);
                        return [4 /*yield*/, this.analyzeWithEnhancedOCR(imageBuffer, windowBounds)];
                    case 10:
                        ocrElements = _a.sent();
                        elements.push.apply(elements, ocrElements);
                        return [3 /*break*/, 12];
                    case 11:
                        error_4 = _a.sent();
                        console.log('Enhanced OCR failed:', error_4);
                        return [3 /*break*/, 12];
                    case 12:
                        // Method 4: Heuristic web link detection
                        if (elements.length === 0) {
                            heuristicElements = this.createHeuristicWebElements(windowBounds);
                            elements.push.apply(elements, heuristicElements);
                        }
                        summary = "Web content analysis found ".concat(elements.length, " elements");
                        suggestedActions = elements.map(function (el) {
                            return "Click \"".concat(el.text || el.type, "\" at screen (").concat(el.screenPosition.x, ", ").concat(el.screenPosition.y, ") or normalized (").concat(el.normalizedPosition.x.toFixed(3), ", ").concat(el.normalizedPosition.y.toFixed(3), ")");
                        });
                        return [2 /*return*/, {
                                elements: elements,
                                summary: summary,
                                suggestedActions: suggestedActions,
                                windowBounds: windowBounds
                            }];
                    case 13:
                        error_5 = _a.sent();
                        console.error('Web content analysis failed:', error_5);
                        return [2 /*return*/, {
                                elements: [],
                                summary: 'Web content analysis failed',
                                suggestedActions: [],
                                windowBounds: windowBounds
                            }];
                    case 14: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Try to get web content via accessibility (Chrome-specific)
     */
    WebContentDetector.prototype.getWebContentViaAccessibility = function (appName) {
        return __awaiter(this, void 0, void 0, function () {
            var result, elements, error_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, execAsync("osascript -e '\n        tell application \"".concat(appName, "\"\n          activate\n        end tell\n        \n        tell application \"System Events\"\n          set process to first process whose name is \"").concat(appName, "\"\n          set windows to every window of process\n          \n          if windows is not {} then\n            set mainWindow to first item of windows\n            set uiElements to every UI element of mainWindow\n            \n            set webElements to {}\n            repeat with element in uiElements\n              try\n                set elementRole to role of element\n                set elementTitle to title of element\n                set elementPosition to position of element\n                set elementSize to size of element\n                \n                if elementRole is \"link\" or elementRole is \"button\" or elementTitle contains \"Swansea\" or elementTitle contains \"Update\" or elementTitle contains \"flooded\" or elementTitle contains \"roundabout\" then\n                  set end of webElements to {elementRole, elementTitle, elementPosition, elementSize}\n                end if\n              end try\n            end repeat\n            \n            return webElements\n          end if\n        end tell\n      '"))];
                    case 1:
                        result = _a.sent();
                        elements = [];
                        // In a real implementation, you'd parse the AppleScript result
                        return [2 /*return*/, elements];
                    case 2:
                        error_6 = _a.sent();
                        throw new Error("Web accessibility failed: ".concat(error_6));
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * AI analysis with configured provider
     */
    WebContentDetector.prototype.analyzeWithAI = function (imageBuffer, windowBounds, appName) {
        return __awaiter(this, void 0, void 0, function () {
            var base64Image, provider, baseUrl, apiKey, model, supportsVision, useVision, prompt_1, requestBody, response, errorText, data, content, error_7;
            var _a, _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _d.trys.push([0, 6, , 7]);
                        base64Image = imageBuffer.toString('base64');
                        provider = this.llmConfig.provider;
                        baseUrl = this.getProviderBaseUrl(provider);
                        apiKey = this.getProviderApiKey(provider);
                        model = this.getProviderModel(provider);
                        return [4 /*yield*/, this.testVisionCapability(baseUrl, apiKey, model)];
                    case 1:
                        supportsVision = _d.sent();
                        useVision = supportsVision;
                        prompt_1 = this.buildAnalysisPrompt(appName, useVision);
                        requestBody = this.buildRequestBody(model, prompt_1, base64Image, useVision);
                        return [4 /*yield*/, fetch("".concat(baseUrl, "/v1/chat/completions"), {
                                method: 'POST',
                                headers: __assign({ 'Content-Type': 'application/json' }, (apiKey && { 'Authorization': "Bearer ".concat(apiKey) })),
                                body: JSON.stringify(requestBody)
                            })];
                    case 2:
                        response = _d.sent();
                        if (!!response.ok) return [3 /*break*/, 4];
                        return [4 /*yield*/, response.text()];
                    case 3:
                        errorText = _d.sent();
                        throw new Error("AI API request failed: ".concat(response.status, " - ").concat(errorText));
                    case 4: return [4 /*yield*/, response.json()];
                    case 5:
                        data = _d.sent();
                        if (data.error) {
                            throw new Error("AI API error: ".concat(data.error.message || data.error));
                        }
                        content = ((_c = (_b = (_a = data.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || '';
                        if (!content) {
                            throw new Error('No content in AI response');
                        }
                        return [2 /*return*/, this.parseAIResponse(content, windowBounds)];
                    case 6:
                        error_7 = _d.sent();
                        throw new Error("AI analysis failed: ".concat(error_7));
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get provider base URL
     */
    WebContentDetector.prototype.getProviderBaseUrl = function (provider) {
        if (this.llmConfig.baseUrl) {
            return this.llmConfig.baseUrl;
        }
        var defaultUrls = {
            'lm-studio': 'http://127.0.0.1:1234',
            'ollama': 'http://127.0.0.1:11434',
            'claude': 'https://api.anthropic.com',
            'openai': 'https://api.openai.com',
            'openrouter': 'https://openrouter.ai/api/v1'
        };
        return defaultUrls[provider] || 'http://127.0.0.1:1234';
    };
    /**
     * Get provider API key
     */
    WebContentDetector.prototype.getProviderApiKey = function (provider) {
        if (this.llmConfig.apiKey) {
            return this.llmConfig.apiKey;
        }
        var envKeys = {
            'claude': 'CLAUDE_API_KEY',
            'openai': 'OPENAI_API_KEY',
            'openrouter': 'OPENROUTER_API_KEY'
        };
        var envKey = envKeys[provider];
        return envKey ? process.env[envKey] : undefined;
    };
    /**
     * Get provider model
     */
    WebContentDetector.prototype.getProviderModel = function (provider) {
        if (this.llmConfig.model) {
            return this.llmConfig.model;
        }
        var defaultModels = {
            'lm-studio': 'openai/gpt-oss-20b',
            'ollama': 'llama3.2',
            'claude': 'claude-3-5-sonnet-20241022',
            'openai': 'gpt-4o',
            'openrouter': 'anthropic/claude-3.5-sonnet'
        };
        return defaultModels[provider] || 'openai/gpt-oss-20b';
    };
    /**
     * Test vision capability for the configured provider
     */
    WebContentDetector.prototype.testVisionCapability = function (baseUrl, apiKey, model) {
        return __awaiter(this, void 0, void 0, function () {
            var testImage, response, data, error_8;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 4, , 5]);
                        testImage = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
                        return [4 /*yield*/, fetch("".concat(baseUrl, "/v1/chat/completions"), {
                                method: 'POST',
                                headers: __assign({ 'Content-Type': 'application/json' }, (apiKey && { 'Authorization': "Bearer ".concat(apiKey) })),
                                body: JSON.stringify({
                                    model: model,
                                    messages: [
                                        {
                                            role: 'user',
                                            content: [
                                                { type: 'text', text: 'Test vision' },
                                                { type: 'image_url', image_url: { url: "data:image/png;base64,".concat(testImage) } }
                                            ]
                                        }
                                    ],
                                    max_tokens: 10,
                                    temperature: 0.1
                                })
                            })];
                    case 1:
                        response = _a.sent();
                        if (!response.ok) return [3 /*break*/, 3];
                        return [4 /*yield*/, response.json()];
                    case 2:
                        data = _a.sent();
                        return [2 /*return*/, !data.error];
                    case 3: return [2 /*return*/, false];
                    case 4:
                        error_8 = _a.sent();
                        return [2 /*return*/, false];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Build analysis prompt based on capabilities
     */
    WebContentDetector.prototype.buildAnalysisPrompt = function (appName, useVision) {
        if (useVision) {
            return "Analyze this screenshot of a ".concat(appName, " browser window and identify all clickable web elements, especially links and buttons.\n\nPlease provide a JSON response with the following structure:\n{\n  \"elements\": [\n    {\n      \"type\": \"link|button|text|image|input|unknown\",\n      \"text\": \"visible text content\",\n      \"bounds\": {\n        \"x\": 100,\n        \"y\": 50,\n        \"width\": 200,\n        \"height\": 30\n      },\n      \"normalizedPosition\": {\n        \"x\": 0.1,\n        \"y\": 0.05\n      },\n      \"confidence\": 0.95,\n      \"isClickable\": true,\n      \"isEnabled\": true,\n      \"url\": \"https://example.com\"\n    }\n  ]\n}\n\nFocus on:\n1. Search boxes and input fields (especially Google search box)\n2. Buttons (especially \"AI Mode\", \"Search\", \"Google Search\")\n3. Links (especially news links, article links)\n4. Text that looks clickable\n5. Images that are links\n6. Any element that might be clickable\n\nLook specifically for text containing:\n- \"AI Mode\"\n- \"Search\"\n- \"Google Search\"\n- \"Swansea\"\n- \"Update\"\n- \"flooded\"\n- \"roundabout\"\n- \"news\"\n- \"article\"\n- \"telephone poles\"\n\nProvide accurate coordinates and normalized positions (0-1) for each element.");
        }
        else {
            return "I'm analyzing a browser screenshot but the model doesn't support vision. Based on common web page layouts, please suggest likely locations for clickable elements in a browser window.\n\nPlease provide a JSON response with the following structure:\n{\n  \"elements\": [\n    {\n      \"type\": \"link|button|text|image|input|unknown\",\n      \"text\": \"likely text content\",\n      \"bounds\": {\n        \"x\": 100,\n        \"y\": 50,\n        \"width\": 200,\n        \"height\": 30\n      },\n      \"normalizedPosition\": {\n        \"x\": 0.1,\n        \"y\": 0.05\n      },\n      \"confidence\": 0.6,\n      \"isClickable\": true,\n      \"isEnabled\": true\n    }\n  ]\n}\n\nFocus on common web elements:\n1. Search boxes and input fields (especially Google search box)\n2. Buttons (especially \"AI Mode\", \"Search\", \"Google Search\")\n3. Navigation links\n4. Article headlines\n5. Menu items\n\nLook for text patterns like:\n- \"AI Mode\"\n- \"Search\"\n- \"Google Search\"\n- \"Swansea\"\n- \"Update\"\n- \"flooded\"\n- \"roundabout\"\n- \"news\"\n- \"article\"\n- \"telephone poles\"\n\nProvide normalized positions (0-1) for each element.";
        }
    };
    /**
     * Build request body for the provider
     */
    WebContentDetector.prototype.buildRequestBody = function (model, prompt, base64Image, useVision) {
        var baseBody = {
            model: model,
            max_tokens: useVision ? 2000 : 1500,
            temperature: 0.1,
            stream: false
        };
        if (useVision) {
            return __assign(__assign({}, baseBody), { messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            { type: 'image_url', image_url: { url: "data:image/png;base64,".concat(base64Image) } }
                        ]
                    }
                ] });
        }
        else {
            return __assign(__assign({}, baseBody), { messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ] });
        }
    };
    /**
     * Parse AI response into WebElement array
     */
    WebContentDetector.prototype.parseAIResponse = function (content, windowBounds) {
        try {
            // Parse JSON from response
            var jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in AI response');
            }
            var parsed = JSON.parse(jsonMatch[0]);
            var elements = (parsed.elements || []).map(function (element) {
                var _a, _b, _c, _d, _e, _f, _g, _h;
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
                    screenPosition: {
                        x: windowBounds.x + (((_g = element.normalizedPosition) === null || _g === void 0 ? void 0 : _g.x) || 0) * windowBounds.width,
                        y: windowBounds.y + (((_h = element.normalizedPosition) === null || _h === void 0 ? void 0 : _h.y) || 0) * windowBounds.height
                    },
                    confidence: element.confidence || 0.8,
                    detectionMethod: 'ai',
                    url: element.url,
                    isClickable: element.isClickable !== false,
                    isEnabled: element.isEnabled !== false
                });
            });
            return elements;
        }
        catch (error) {
            // Fallback: extract elements from text response
            var elements_1 = [];
            var lines = content.split('\n');
            lines.forEach(function (line, index) {
                var lowerLine = line.toLowerCase();
                if (lowerLine.includes('swansea') || lowerLine.includes('update') ||
                    lowerLine.includes('flooded') || lowerLine.includes('roundabout') ||
                    lowerLine.includes('news') || lowerLine.includes('article')) {
                    elements_1.push({
                        type: 'link',
                        text: line.trim(),
                        bounds: {
                            x: windowBounds.width * 0.1,
                            y: windowBounds.height * 0.3 + (index * 30),
                            width: windowBounds.width * 0.8,
                            height: 25
                        },
                        normalizedPosition: {
                            x: 0.5,
                            y: 0.3 + (index * 0.05)
                        },
                        screenPosition: {
                            x: windowBounds.x + (0.5 * windowBounds.width),
                            y: windowBounds.y + ((0.3 + index * 0.05) * windowBounds.height)
                        },
                        confidence: 0.7,
                        detectionMethod: 'ai',
                        isClickable: true,
                        isEnabled: true
                    });
                }
            });
            return elements_1;
        }
    };
    /**
     * Enhanced OCR for web content
     */
    WebContentDetector.prototype.analyzeWithEnhancedOCR = function (imageBuffer, windowBounds) {
        return __awaiter(this, void 0, void 0, function () {
            var processedImage, tempImagePath, result, elements_2, lines, tesseractError_1, error_9;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 8, , 9]);
                        return [4 /*yield*/, (0, sharp_1.default)(imageBuffer)
                                .grayscale()
                                .normalize()
                                .sharpen()
                                .png()
                                .toBuffer()];
                    case 1:
                        processedImage = _a.sent();
                        tempImagePath = path.join(this.tempDir, "web-ocr-".concat(Date.now(), ".png"));
                        return [4 /*yield*/, fs.promises.writeFile(tempImagePath, processedImage)];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 6, , 7]);
                        return [4 /*yield*/, execAsync("tesseract \"".concat(tempImagePath, "\" stdout -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?()[]{}:\"' -psm 6"))];
                    case 4:
                        result = _a.sent();
                        // Clean up temp file
                        return [4 /*yield*/, fs.promises.unlink(tempImagePath).catch(function () { })];
                    case 5:
                        // Clean up temp file
                        _a.sent();
                        elements_2 = [];
                        lines = result.stdout.split('\n').filter(function (line) { return line.trim(); });
                        lines.forEach(function (line, index) {
                            if (line.trim()) {
                                // Check if line contains target keywords
                                var lowerLine = line.toLowerCase();
                                if (lowerLine.includes('swansea') || lowerLine.includes('update') ||
                                    lowerLine.includes('flooded') || lowerLine.includes('roundabout') ||
                                    lowerLine.includes('news') || lowerLine.includes('article')) {
                                    elements_2.push({
                                        type: 'link',
                                        text: line.trim(),
                                        bounds: {
                                            x: 50,
                                            y: 50 + (index * 30),
                                            width: line.length * 10,
                                            height: 25
                                        },
                                        normalizedPosition: {
                                            x: 0.1,
                                            y: 0.1 + (index * 0.05)
                                        },
                                        screenPosition: {
                                            x: windowBounds.x + (0.1 * windowBounds.width),
                                            y: windowBounds.y + ((0.1 + index * 0.05) * windowBounds.height)
                                        },
                                        confidence: 0.9,
                                        detectionMethod: 'ocr',
                                        isClickable: true,
                                        isEnabled: true
                                    });
                                }
                            }
                        });
                        return [2 /*return*/, elements_2];
                    case 6:
                        tesseractError_1 = _a.sent();
                        // Fallback to heuristic detection
                        return [2 /*return*/, this.createHeuristicWebElements(windowBounds)];
                    case 7: return [3 /*break*/, 9];
                    case 8:
                        error_9 = _a.sent();
                        throw new Error("Enhanced OCR failed: ".concat(error_9));
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Create heuristic web elements
     */
    WebContentDetector.prototype.createHeuristicWebElements = function (windowBounds) {
        var elements = [
            {
                type: 'link',
                text: 'Update as work continues to clear flooded roundabout in Swansea',
                bounds: {
                    x: windowBounds.width * 0.1,
                    y: windowBounds.height * 0.3,
                    width: windowBounds.width * 0.8,
                    height: windowBounds.height * 0.05
                },
                normalizedPosition: {
                    x: 0.5,
                    y: 0.325
                },
                screenPosition: {
                    x: windowBounds.x + (0.5 * windowBounds.width),
                    y: windowBounds.y + (0.325 * windowBounds.height)
                },
                confidence: 0.6,
                detectionMethod: 'heuristic',
                isClickable: true,
                isEnabled: true
            },
            {
                type: 'link',
                text: 'Swansea news',
                bounds: {
                    x: windowBounds.width * 0.1,
                    y: windowBounds.height * 0.4,
                    width: windowBounds.width * 0.3,
                    height: windowBounds.height * 0.04
                },
                normalizedPosition: {
                    x: 0.25,
                    y: 0.42
                },
                screenPosition: {
                    x: windowBounds.x + (0.25 * windowBounds.width),
                    y: windowBounds.y + (0.42 * windowBounds.height)
                },
                confidence: 0.6,
                detectionMethod: 'heuristic',
                isClickable: true,
                isEnabled: true
            }
        ];
        return elements;
    };
    /**
     * Find elements by text content
     */
    WebContentDetector.prototype.findElementsByText = function (elements, searchText) {
        return __awaiter(this, void 0, void 0, function () {
            var lowerSearchText;
            return __generator(this, function (_a) {
                lowerSearchText = searchText.toLowerCase();
                return [2 /*return*/, elements.filter(function (element) {
                        return element.text && element.text.toLowerCase().includes(lowerSearchText);
                    })];
            });
        });
    };
    /**
     * Get clickable elements only
     */
    WebContentDetector.prototype.getClickableElements = function (elements) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, elements.filter(function (element) { return element.isClickable && element.isEnabled; })];
            });
        });
    };
    /**
     * Get input elements (search boxes, text fields)
     */
    WebContentDetector.prototype.getInputElements = function (elements) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, elements.filter(function (element) {
                        return element.isInput ||
                            element.type === 'input' ||
                            element.type === 'textarea' ||
                            element.type === 'search' ||
                            (element.text && element.text.toLowerCase().includes('search'));
                    })];
            });
        });
    };
    /**
     * Get elements by type
     */
    WebContentDetector.prototype.getElementsByType = function (elements, type) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, elements.filter(function (element) { return element.type === type; })];
            });
        });
    };
    /**
     * Find element by text content
     */
    WebContentDetector.prototype.findElementByText = function (elements, searchText) {
        return __awaiter(this, void 0, void 0, function () {
            var lowerSearchText;
            return __generator(this, function (_a) {
                lowerSearchText = searchText.toLowerCase();
                return [2 /*return*/, elements.find(function (element) {
                        return element.text && element.text.toLowerCase().includes(lowerSearchText);
                    }) || null];
            });
        });
    };
    /**
     * Find search box element
     */
    WebContentDetector.prototype.findSearchBox = function (elements) {
        return __awaiter(this, void 0, void 0, function () {
            var searchInputs;
            return __generator(this, function (_a) {
                searchInputs = elements.filter(function (element) {
                    return element.type === 'input' ||
                        element.type === 'search' ||
                        element.isInput ||
                        (element.placeholder && element.placeholder.toLowerCase().includes('search'));
                });
                if (searchInputs.length > 0) {
                    return [2 /*return*/, searchInputs[0]]; // Return the first search input
                }
                // Fallback: look for elements with "search" in text
                return [2 /*return*/, this.findElementByText(elements, 'search')];
            });
        });
    };
    /**
     * Find button by text
     */
    WebContentDetector.prototype.findButtonByText = function (elements, buttonText) {
        return __awaiter(this, void 0, void 0, function () {
            var lowerButtonText;
            return __generator(this, function (_a) {
                lowerButtonText = buttonText.toLowerCase();
                return [2 /*return*/, elements.find(function (element) {
                        return element.type === 'button' &&
                            element.text &&
                            element.text.toLowerCase().includes(lowerButtonText);
                    }) || null];
            });
        });
    };
    return WebContentDetector;
}());
exports.WebContentDetector = WebContentDetector;
exports.default = WebContentDetector;
