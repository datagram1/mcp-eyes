/**
 * Service Discovery (mDNS/Bonjour)
 * Platform-specific implementations for advertising the agent
 */

#include "platform.h"

#ifdef __APPLE__
#include <dns_sd.h>
#include <thread>
#include <atomic>

namespace mcp_eyes {

class BonjourDiscovery : public Discovery {
public:
    BonjourDiscovery() : service_ref_(nullptr), running_(false) {}

    ~BonjourDiscovery() {
        stop_advertising();
    }

    bool start_advertising(const AgentStatus& status) override {
        if (running_) return true;

        // Build TXT record
        TXTRecordRef txt_record;
        TXTRecordCreate(&txt_record, 0, nullptr);

        TXTRecordSetValue(&txt_record, "name", status.name.length(), status.name.c_str());
        TXTRecordSetValue(&txt_record, "os", status.os.length(), status.os.c_str());
        TXTRecordSetValue(&txt_record, "version", status.version.length(), status.version.c_str());
        TXTRecordSetValue(&txt_record, "arch", status.arch.length(), status.arch.c_str());

        // Register service
        DNSServiceErrorType err = DNSServiceRegister(
            &service_ref_,
            0,                          // flags
            0,                          // interface (all)
            status.name.c_str(),        // name
            "_mcp-eyes._tcp",           // service type
            nullptr,                    // domain (default)
            nullptr,                    // host (default)
            htons(status.port),         // port
            TXTRecordGetLength(&txt_record),
            TXTRecordGetBytesPtr(&txt_record),
            register_callback,
            this
        );

        TXTRecordDeallocate(&txt_record);

        if (err != kDNSServiceErr_NoError) {
            return false;
        }

        running_ = true;

        // Process events in background thread
        event_thread_ = std::thread([this]() {
            while (running_ && service_ref_) {
                DNSServiceProcessResult(service_ref_);
            }
        });

        return true;
    }

    void stop_advertising() override {
        running_ = false;

        if (service_ref_) {
            DNSServiceRefDeallocate(service_ref_);
            service_ref_ = nullptr;
        }

        if (event_thread_.joinable()) {
            event_thread_.join();
        }
    }

    bool is_advertising() const override {
        return running_;
    }

private:
    DNSServiceRef service_ref_;
    std::atomic<bool> running_;
    std::thread event_thread_;

    static void register_callback(
        DNSServiceRef,
        DNSServiceFlags,
        DNSServiceErrorType error,
        const char* name,
        const char* type,
        const char* domain,
        void* context
    ) {
        if (error == kDNSServiceErr_NoError) {
            // Successfully registered
        }
    }
};

std::unique_ptr<Discovery> Discovery::create() {
    return std::make_unique<BonjourDiscovery>();
}

} // namespace mcp_eyes

#elif _WIN32

// Windows implementation using DNS-SD or Windows mDNS
namespace mcp_eyes {

class WindowsDiscovery : public Discovery {
public:
    bool start_advertising(const AgentStatus&) override {
        // TODO: Implement using Bonjour SDK for Windows or native mDNS
        return false;
    }

    void stop_advertising() override {}
    bool is_advertising() const override { return false; }
};

std::unique_ptr<Discovery> Discovery::create() {
    return std::make_unique<WindowsDiscovery>();
}

} // namespace mcp_eyes

#else

// Linux implementation using Avahi
namespace mcp_eyes {

class AvahiDiscovery : public Discovery {
public:
    bool start_advertising(const AgentStatus&) override {
        // TODO: Implement using libavahi-client
        return false;
    }

    void stop_advertising() override {}
    bool is_advertising() const override { return false; }
};

std::unique_ptr<Discovery> Discovery::create() {
    return std::make_unique<AvahiDiscovery>();
}

} // namespace mcp_eyes

#endif
