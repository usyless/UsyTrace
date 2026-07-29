#pragma once

#include <cstdint>
#include <string>
#include <algorithm>

#include <usylibpp/strings.hpp>

#include "../structures.hpp"

#include "normal.hpp"
#include "experimental.hpp"

enum class TraceAlgorithm : std::uint8_t {
    Normal = 0,
    Experimental = 1
};

struct Trace {
    frTrace trace;
    const ImageData<4>& imageData;

    Trace(const ImageData<4>& data) : imageData(data) {}
    Trace(const ImageData<4>& data, frTrace&& _trace) : trace(std::move(_trace)), imageData(data) {}

    Trace(Trace&& other) noexcept : trace(std::move(other.trace)), imageData(other.imageData) {}
    Trace& operator=(Trace&& other) noexcept { 
        if (this != &other) trace = std::move(other.trace);
        return *this;
    }

    Trace(const Trace&) = delete;
    Trace& operator=(const Trace&) = delete;

    std::vector<std::pair<uint32_t, uint32_t>> clean() const {
        std::vector<std::pair<uint32_t, uint32_t>> simplifiedTrace{};
        if (trace.size() > 2) {
            simplifiedTrace.reserve(trace.size());
            if (trace.size() > 2) {
                auto iter = trace.begin();
                simplifiedTrace.emplace_back(iter->first, iter->second);
                const auto end = trace.end();
                for (++iter; iter != end; ++iter) {
                    uint64_t sumKey = iter->first;
                    uint32_t count = 1;
                    auto previousKey = iter->first;
                    const auto previousValue = iter->second;
                    while (++iter != end && iter->second == previousValue && iter->first == previousKey + 1) {
                        previousKey = iter->first;
                        sumKey += previousKey;
                        ++count;
                    }
                    --iter;
                    simplifiedTrace.emplace_back(static_cast<uint32_t>(sumKey / count), previousValue);
                }
                if (simplifiedTrace.back().first != trace.rbegin()->first) {
                    simplifiedTrace.emplace_back(trace.rbegin()->first, trace.rbegin()->second);
                }
            } else {
                std::copy(trace.begin(), trace.end(), std::back_inserter(simplifiedTrace));
            }
        }
        return simplifiedTrace;
    }

    std::string toSVG() const {
        std::string svg;
        if (const auto res = clean(); !res.empty()) {
            svg.reserve(res.size() * 16 + 32);
            auto iter = res.begin();
            const auto end = res.end();
            if (res.size() == 1) {
                const std::string first{ulp::str::to_string_view_or_default(iter->first)};
                svg += ulp::str::concat_strings("M", first, " ", ulp::str::to_string_view_or_default(iter->second), "q2 0 2 2t-2 2-2-2 2-2");
            } else {
                svg += "M";
                for (; iter != end; ++iter) {
                    const std::string first{ulp::str::to_string_view_or_default(iter->first)};
                    svg += ulp::str::concat_strings(first, " ", ulp::str::to_string_view_or_default(iter->second), " ");
                }
                if (svg.size() > 1) svg.pop_back();
            }
        }
        return svg;
    }

    Trace newTrace(const TraceAlgorithm algorithm, auto&& context, const TraceData& _traceData, const bool traceLeft = false) const {
        if (_traceData.x == std::numeric_limits<uint32_t>::max() || _traceData.y == std::numeric_limits<uint32_t>::max()) {
            return Trace{imageData};
        }
        
        const auto traceData = _traceData.clamp(imageData);
        frTrace newTrace{trace};

        switch (algorithm) {
            case TraceAlgorithm::Normal: {
                const auto maxLineHeight = std::max<uint32_t>(0, imageData.height / 20);
                const auto maxJump = std::max<uint32_t>(0, imageData.width / 50);
                auto baselineColour = RGBTools(imageData.getRGB(traceData.x, traceData.y), traceData.colourTolerance);

                newTrace.erase(newTrace.lower_bound(traceData.x), newTrace.end());

                if (traceLeft) Algorithms::Normal::traceFor(traceData.x - 1, traceData.y, -1, newTrace, imageData, maxLineHeight, maxJump, baselineColour);
                Algorithms::Normal::traceFor(traceData.x, traceData.y, 1, newTrace, imageData, maxLineHeight, maxJump, baselineColour);

                break;
            }
            case TraceAlgorithm::Experimental: {
                if (!context.clusters) {
                    context.clusters.emplace(Algorithms::Experimental::analyseColours(imageData, ColourVec{context.background}));
                }
                newTrace.erase(newTrace.lower_bound(traceData.x), newTrace.end());
                for (const auto& [x, y] : Algorithms::Experimental::traceFromPoint(context, traceData.x, traceData.y, traceLeft)) {
                    newTrace.insert_or_assign(x, y);
                }

                break;
            }
            default:
                return Trace{imageData};
        }

        return {imageData, std::move(newTrace)};
    }

    // Gaussian smoothing
    Trace smooth(int windowSize, const double sigma) const {
        frTrace newTrace{};
        const double multi = -0.5 / (sigma * sigma);
        if (windowSize % 2 == 0) {
            ++windowSize;
        }
        if (trace.size() > static_cast<size_t>(windowSize)) {
            const int halfWindow = windowSize / 2;
            const auto begin = trace.begin(), end = trace.end();

            for (auto it = begin; it != end; ++it) {
                double smoothed = 0.0;
                double sumWeights = 0.0;

                auto from = it, to = it;
                for (int i = 0; i < halfWindow && from != begin; ++i) --from;
                for (int i = 0; i <= halfWindow && to != end; ++i) ++to;

                const double currX = it->first;
                for (auto other = from; other != to; ++other) {
                    double distance = other->first - currX;
                    double weight = exp(multi * (distance * distance));
                    smoothed += other->second * weight;
                    sumWeights += weight;
                }
                newTrace.emplace_hint(newTrace.end(), it->first, static_cast<uint32_t>((smoothed / sumWeights) + 0.5));
            }
        }
        return {imageData, std::move(newTrace)};
    }

    inline Trace standardSmooth(int width) const {
        const int windowSize = std::max(width / 150, 2);
        return smooth(windowSize, static_cast<double>(windowSize) / 2.0);
    }

    Trace eraseRegion(uint32_t begin, uint32_t end) const {
        frTrace newTrace{trace};
        const auto lower = newTrace.lower_bound(begin);
        const auto higher = newTrace.upper_bound(end);
        if (lower != higher) {
            newTrace.erase(lower, higher);
        }
        return {imageData, std::move(newTrace)};
    }

    Trace addPoint(const TraceData& _traceData) const {
        const auto traceData = _traceData.clamp(imageData);

        frTrace newTrace{trace};
        newTrace[traceData.x] = traceData.y;
        return {imageData, std::move(newTrace)};
    }

    Trace offsetTrace(uint8_t direction, uint32_t magnitude) const {
        frTrace newTrace{};

        switch (direction) {
            case 0: {
                // down
                const auto image_height_bound = imageData.height - 1;
                for (const auto [key, val] : trace) {
                    const auto newVal = val + magnitude;
                    if (newVal > image_height_bound) continue;
                    newTrace.emplace_hint(newTrace.end(), key, newVal);
                }
                break;
            }
            case 1: {
                // up
                for (const auto [key, val] : trace) {
                    const auto newVal = static_cast<int>(val) - static_cast<int>(magnitude);
                    if (newVal < 0) continue;
                    newTrace.emplace_hint(newTrace.end(), key, static_cast<uint32_t>(newVal));
                }
                break;
            }
            case 2: {
                // left
                for (const auto [key, val] : trace) {
                    const auto newKey = static_cast<int>(key) - static_cast<int>(magnitude);
                    if (newKey < 0) continue;
                    newTrace.emplace_hint(newTrace.end(), static_cast<uint32_t>(newKey), val);
                }
                break;
            }
            case 3: {
                // right
                const auto image_width_bound = imageData.width - 1;
                for (const auto [key, val] : trace) {
                    const auto newKey = key + magnitude;
                    if (newKey > image_width_bound) continue;
                    newTrace.emplace_hint(newTrace.end(), newKey, val);
                }
                break;
            }
        }

        return {imageData, std::move(newTrace)};
    }

    size_t size() const noexcept {
        if (trace.empty()) return 0;
        if (trace.size() == 1) return 1;

        return standardSmooth(static_cast<int>(imageData.width)).clean().size();
    }

    bool empty() const noexcept {
        return trace.empty();
    }

    bool operator==(const Trace& other) const {
        return trace == other.trace;
    }
};