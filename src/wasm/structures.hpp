#pragma once

#include <map>
#include <array>
#include <memory>
#include <cstdint>
#include <algorithm>
#include <set>
#include <vector>
#include <optional>
#include <cmath>

using Colour = uint8_t;
using frTrace = std::map<uint32_t, uint32_t>;

struct RGB {
    Colour R, G, B;

    constexpr RGB(const Colour r, const Colour g, const Colour b) noexcept : R(r), G(g), B(b) {}

    static constexpr inline Colour biggestDifference(const RGB& rgb) noexcept {
        return std::abs(static_cast<int>(std::max(std::max(rgb.R, rgb.G), rgb.B)) - std::min(std::min(rgb.R, rgb.G), rgb.B));
    }

    constexpr inline double getDifference(const RGB& rgb) const noexcept {
        const int rmean = (static_cast<int>(R) + rgb.R) / 2;
        const int rdiff = static_cast<int>(R) - rgb.R;
        const int gdiff = static_cast<int>(G) - rgb.G;
        const int bdiff = static_cast<int>(B) - rgb.B;
        return sqrt((512 + rmean) * ((rdiff * rdiff) >> 8) + 4 * (gdiff * gdiff) + (((767 - rmean) * (bdiff * bdiff)) >> 8));
    }

    constexpr bool operator==(const RGB& rgb) const noexcept {
        return R == rgb.R && G == rgb.G && B == rgb.B;
    }

    constexpr bool operator<(const RGB& rgb) const noexcept {
        return toBin() < rgb.toBin();
    }

    constexpr inline uint32_t sum() const noexcept {
        return R + G + B;
    }

    constexpr inline int toBin() const noexcept {
        return (static_cast<int>(R) << 16) | (static_cast<int>(G) << 8) | static_cast<int>(B);
    }
};

template <uint32_t Channels>
struct ImageData {
    std::unique_ptr<Colour[]> data;
    const uint32_t width, height;

    static constexpr size_t channels = Channels;

    ImageData(const uint32_t width, const uint32_t height) : width(width), height(height) {
        data.reset(ImageData<Channels>::allocate_buffer(width, height));
    }
    constexpr ImageData(Colour* data, const uint32_t width, const uint32_t height) noexcept : data(data), width(width), height(height) {}

    constexpr inline RGB getRGB(const uint32_t x, const uint32_t y) const noexcept {
        const auto pos = (y * width + x) * channels;
        return {data[pos], data[pos + 1], data[pos + 2]};
    }

    constexpr inline Colour getR(const uint32_t x, const uint32_t y) const noexcept {
        return data[(y * width + x) * channels];
    }

    constexpr inline uint32_t getMaxPos() const noexcept {
        return width * height * channels;
    }

    inline RGB getBackgroundColour() const {
        if (width == 0 || height == 0) return {255, 255, 255};

        alignas(4) std::array<uint16_t, 4096> bins{};

        auto toBin = [](const RGB& rgb) noexcept -> uint16_t {
            return (static_cast<uint16_t>(rgb.R >> 4) << 8) |
                   (static_cast<uint16_t>(rgb.G >> 4) << 4) |
                   static_cast<uint16_t>(rgb.B >> 4);
        };

        const uint32_t xStep = std::max<uint32_t>(1, width / 40);
        const uint32_t yStep = std::max<uint32_t>(1, height / 40);

        for (uint32_t x = 0; x < width; x += xStep) {
            bins[toBin(getRGB(x, 0))] += 3;
            bins[toBin(getRGB(x, height - 1))] += 3;
        }
        for (uint32_t y = 0; y < height; y += yStep) {
            bins[toBin(getRGB(0, y))] += 3;
            bins[toBin(getRGB(width - 1, y))] += 3;
        }

        const uint32_t xInterior = std::max<uint32_t>(1, width / 30);
        const uint32_t yInterior = std::max<uint32_t>(1, height / 30);
        for (uint32_t y = yStep; y + yStep < height; y += yInterior) {
            for (uint32_t x = xStep; x + xStep < width; x += xInterior) {
                ++bins[toBin(getRGB(x, y))];
            }
        }

        uint16_t maxIdx = 0;
        uint16_t maxCount = 0;
        for (uint32_t i = 0; i < 4096; ++i) {
            if (bins[i] > maxCount) {
                maxCount = bins[i];
                maxIdx = static_cast<uint16_t>(i);
            }
        }
        if (maxCount == 0) return {255, 255, 255};

        uint32_t sumR = 0, sumG = 0, sumB = 0, total = 0;
        auto accumulate = [&](uint32_t x, uint32_t y) {
            const auto rgb = getRGB(x, y);
            if (toBin(rgb) == maxIdx) {
                sumR += rgb.R;
                sumG += rgb.G;
                sumB += rgb.B;
                ++total;
            }
        };

        for (uint32_t x = 0; x < width; x += xStep) {
            accumulate(x, 0);
            accumulate(x, height - 1);
        }
        for (uint32_t y = 0; y < height; y += yStep) {
            accumulate(0, y);
            accumulate(width - 1, y);
        }
        for (uint32_t y = yStep; y + yStep < height; y += yInterior) {
            for (uint32_t x = xStep; x + xStep < width; x += xInterior) {
                accumulate(x, y);
            }
        }

        if (total == 0) {
            return {
                static_cast<Colour>(((maxIdx >> 8) & 0x0F) * 17),
                static_cast<Colour>(((maxIdx >> 4) & 0x0F) * 17),
                static_cast<Colour>((maxIdx & 0x0F) * 17)
            };
        }

        return {
            static_cast<Colour>(sumR / total),
            static_cast<Colour>(sumG / total),
            static_cast<Colour>(sumB / total)
        };
    }

    static Colour* allocate_buffer(const uint32_t width, const uint32_t height) {
        if (width == 0 || height == 0) return nullptr;
        return new Colour[static_cast<size_t>(width) * height * Channels];
    }
};

struct RGBTools {
    RGB rgb;
    uint32_t tolerance;
    uint32_t count = 1;

    constexpr RGBTools(RGB rgb, const uint32_t tolerance) noexcept : rgb(std::move(rgb)), tolerance(tolerance) {}

    constexpr inline bool withinTolerance(const RGB& rgb) const noexcept {
        return this->rgb.getDifference(rgb) <= tolerance;
    }

    constexpr inline void addToAverage(const RGB& rgb) noexcept {
        const auto r = static_cast<int>(this->rgb.R), g = static_cast<int>(this->rgb.G), b = static_cast<int>(this->rgb.B);
        const auto oR = static_cast<int>(rgb.R), oG = static_cast<int>(rgb.G), oB = static_cast<int>(rgb.B);
        this->rgb.R += static_cast<Colour>((sqrt(((r * r) + (oR * oR)) / 2) - r) / count);
        this->rgb.G += static_cast<Colour>((sqrt(((g * g) + (oG * oG)) / 2) - g) / count);
        this->rgb.B += static_cast<Colour>((sqrt(((b * b) + (oB * oB)) / 2) - b) / count);
        ++count;
    }
};

struct TraceData {
    uint32_t x = 0, y = 0, colourTolerance = 0;

    constexpr TraceData(const uint32_t x, const uint32_t y) noexcept : x(x), y(y) {}
    constexpr explicit TraceData(const uint32_t colourTolerance) noexcept : colourTolerance(colourTolerance) {}
    constexpr TraceData(const uint32_t x, const uint32_t y, const uint32_t colourTolerance) noexcept : x(x), y(y), colourTolerance(colourTolerance) {}

    constexpr TraceData clamp(const ImageData<4>& data) const noexcept {
        return TraceData{std::clamp(x, 0U, data.width - 1), std::clamp(y, 0U, data.height - 1), colourTolerance};
    }
};

struct ColourVec {
    float r = 0.0f, g = 0.0f, b = 0.0f;

    constexpr ColourVec() noexcept = default;
    constexpr ColourVec(const float r, const float g, const float b) noexcept : r(r), g(g), b(b) {}
    constexpr explicit ColourVec(const RGB& rgb) noexcept : r(rgb.R / 255.0f), g(rgb.G / 255.0f), b(rgb.B / 255.0f) {}

    constexpr ColourVec operator+(const ColourVec& o) const noexcept { return {r + o.r, g + o.g, b + o.b}; }
    constexpr ColourVec operator-(const ColourVec& o) const noexcept { return {r - o.r, g - o.g, b - o.b}; }
    constexpr ColourVec operator*(const float s) const noexcept { return {r * s, g * s, b * s}; }

    constexpr inline float chroma() const noexcept {
        return std::max(std::max(r, g), b) - std::min(std::min(r, g), b);
    }
};

struct ColourCluster {
    ColourVec colour{};
    uint32_t count = 0;
    uint32_t minX = 0, maxX = 0;

    constexpr inline uint32_t span() const noexcept { return maxX - minX + 1; }
};

struct TraceContext {
    const ImageData<4>& image;
    ColourVec background;
    std::optional<std::vector<ColourCluster>>& clusters;
    const std::set<uint32_t>& horizontalLines;
};