/**
 * Screen Streaming Module
 *
 * Provides screen capture and streaming functionality using libscreencontrol.
 * Supports real-time frame encoding and delivery via WebSocket.
 */

#pragma once

#include <string>
#include <atomic>
#include <mutex>
#include <thread>
#include <functional>
#include <vector>
#include <cstdint>

namespace ScreenControl
{

/**
 * Screen streaming configuration
 */
struct StreamConfig
{
    uint8_t maxFps = 30;        // Maximum frames per second
    uint8_t quality = 80;       // Encoding quality (0-100)
    bool useZstd = true;        // Use Zstd compression
    bool useJpeg = true;        // Use JPEG for large regions
    bool captureCursor = true;  // Include cursor in capture
    uint32_t displayId = 0;     // Display to capture (0 = primary)
};

/**
 * Encoded frame data for transmission
 */
struct EncodedFrameData
{
    uint32_t sequence;
    uint32_t timestamp;
    std::vector<uint8_t> data;  // Serialized frame data
    uint16_t numRects;
};

/**
 * Frame callback type
 */
using FrameCallback = std::function<void(const EncodedFrameData& frame)>;

/**
 * Display information
 */
struct DisplayInfo
{
    uint32_t id;
    std::string name;
    uint16_t width;
    uint16_t height;
    uint16_t x;
    uint16_t y;
    uint8_t scale;
    bool isPrimary;
    bool isBuiltin;
};

/**
 * Screen streaming manager
 */
class ScreenStream
{
public:
    static ScreenStream& getInstance();

    // Non-copyable
    ScreenStream(const ScreenStream&) = delete;
    ScreenStream& operator=(const ScreenStream&) = delete;

    /**
     * Check if screen capture is available on this platform
     */
    bool isAvailable() const;

    /**
     * Check if screen capture permission is granted
     */
    bool hasPermission() const;

    /**
     * Request screen capture permission (opens system dialog)
     */
    void requestPermission();

    /**
     * Get list of available displays
     */
    std::vector<DisplayInfo> getDisplays() const;

    /**
     * Start streaming with given configuration
     *
     * @param config Stream configuration
     * @param callback Called for each encoded frame
     * @return Stream ID or empty string on failure
     */
    std::string startStream(const StreamConfig& config, FrameCallback callback);

    /**
     * Stop a streaming session
     *
     * @param streamId Stream to stop
     */
    void stopStream(const std::string& streamId);

    /**
     * Stop all streaming sessions
     */
    void stopAllStreams();

    /**
     * Check if a stream is active
     */
    bool isStreamActive(const std::string& streamId) const;

    /**
     * Get stream statistics
     */
    struct StreamStats
    {
        uint64_t framesEncoded;
        uint64_t bytesEncoded;
        double compressionRatio;
        uint32_t avgEncodeTimeUs;
        uint32_t currentFps;
    };
    bool getStreamStats(const std::string& streamId, StreamStats& stats) const;

    /**
     * Request a full frame refresh (keyframe)
     */
    void requestRefresh(const std::string& streamId);

    /**
     * Update stream configuration
     */
    bool updateConfig(const std::string& streamId, const StreamConfig& config);

    /**
     * Take a single screenshot
     *
     * @param displayId Display to capture (0 = primary)
     * @param quality JPEG quality (0-100)
     * @param outData Output image data (JPEG)
     * @return true on success
     */
    bool captureScreenshot(uint32_t displayId, uint8_t quality,
                           std::vector<uint8_t>& outData);

    // Internal: Process captured frame (called from static callback)
    // Takes internal types, not for external use
    struct StreamSession;
    void processFrame(StreamSession* session, const void* framePtr);

private:
    ScreenStream();
    ~ScreenStream();

    // Capture loop - runs in dedicated thread
    void runCaptureLoop(StreamSession* session);

    std::mutex m_mutex;
    std::vector<std::unique_ptr<StreamSession>> m_sessions;
    std::atomic<uint32_t> m_nextStreamId{1};

    // Platform-specific implementation
    class Impl;
    std::unique_ptr<Impl> m_impl;
};

} // namespace ScreenControl
