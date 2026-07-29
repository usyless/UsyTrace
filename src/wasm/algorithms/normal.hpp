#pragma once

#include "../structures.hpp"

namespace Algorithms::Normal {

inline void traceFor(uint32_t startX, uint32_t startY, const int step, frTrace& trace, const ImageData<4>& imageData, const uint32_t maxLineHeight, const uint32_t maxJump, RGBTools& colour) {
    std::vector<uint32_t> yValues{};
    uint32_t currJump = 0;
    const uint32_t maxHeight = imageData.height - 1;
    for (const auto width = imageData.width; startX >= 0 && startX < width; startX += step) {
        yValues.clear();
        auto max = static_cast<int>((maxLineHeight + (currJump * 2)) / 2);
        auto low = (max > startY) ? -static_cast<int>(startY) : -max;
        if (startY + max > maxHeight) max = maxHeight - startY;
        for (; low <= max; ++low) {
            const auto y = startY + low;
            if (colour.withinTolerance(imageData.getRGB(startX, y))) yValues.emplace_back(y);
        }
        if (!yValues.empty()) {
            currJump = 0;
            startY = yValues[yValues.size() / 2]; // is sorted already
            trace[startX] = startY;
            RGB newRGB = imageData.getRGB(startX, startY);
            if (colour.withinTolerance(newRGB)) colour.addToAverage(newRGB);
            continue;
        }
        if (currJump < maxJump) ++currJump;
        else break;
    }
}

inline TraceData getPotentialTrace(const ImageData<4>& imageData, TraceData traceData, auto&& differenceFunc) {
    auto bestY = 0, currentDiff = 0;
    const auto middleX = imageData.width / 2;
    const auto yRange = imageData.height / 5;
    const auto middleY = imageData.height / 2;
    auto y = middleY - yRange;

    for(const auto endY = middleY + yRange; y <= endY; ++y) {
        if (const auto diff = differenceFunc(imageData.getRGB(middleX, y)); diff >= std::max(10, currentDiff)) {
            bestY = y;
            currentDiff = diff;
        }
    }

    if (bestY > 0) {
        traceData.x = middleX;
        traceData.y = bestY;
        return traceData;
    }
    return TraceData{std::numeric_limits<uint32_t>::max(), std::numeric_limits<uint32_t>::max()};
}

}