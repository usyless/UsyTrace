#pragma once

#include <algorithm>
#include <array>
#include <set>
#include <optional>

#include "../structures.hpp"

namespace Algorithms::Experimental {

constexpr inline float colourDot(const ColourVec& a, const ColourVec& b) noexcept {
    return (2.0f * a.r * b.r + 4.0f * a.g * b.g + 3.0f * a.b * b.b) / 9.0f;
}

constexpr inline float colourDistanceSq(const ColourVec& a, const ColourVec& b) noexcept {
    const auto d = a - b;
    return colourDot(d, d);
}

inline float colourDistance(const ColourVec& a, const ColourVec& b) noexcept {
    return std::sqrt(colourDistanceSq(a, b));
}

constexpr inline float smoothStep(const float edge0, const float edge1, const float x) noexcept {
    const float t = std::clamp((x - edge0) / (edge1 - edge0), 0.0f, 1.0f);
    return t * t * (3.0f - 2.0f * t);
}

struct ColourModel {
    static constexpr size_t maxReferences = 3;

    std::array<ColourVec, maxReferences> references{};
    std::array<ColourVec, maxReferences> blendAxis{};
    std::array<float, maxReferences> blendAxisLengthSq{};
    size_t referenceCount = 0;
    ColourVec background{1.0f, 1.0f, 1.0f};
    float tolerance = 0.1f;
    float minRelevantSq = 0.0f;

    // Tolerance and background must both be set before this is called.
    void setReferences(const ColourVec* colours, const size_t count) noexcept {
        referenceCount = std::min(count, maxReferences);
        float minRelevant = 0.0f;
        for (size_t i = 0; i < referenceCount; ++i) {
            references[i] = colours[i];
            blendAxis[i] = colours[i] - background;
            blendAxisLengthSq[i] = colourDot(blendAxis[i], blendAxis[i]);

            const float axisLength = std::sqrt(blendAxisLengthSq[i]);
            const float needed = std::min(0.30f * axisLength, std::max(0.0f, axisLength - 1.25f * tolerance));
            minRelevant = (i == 0) ? needed : std::min(minRelevant, needed);
        }
        minRelevantSq = minRelevant * minRelevant;
    }

    float score(const RGB& pixel) const noexcept {
        const ColourVec p{pixel};
        const auto relative = p - background;
        return scoreVec(p, relative, colourDot(relative, relative));
    }

    float scoreVec(const ColourVec& p, const ColourVec& relative, const float relativeSq) const noexcept {
        if (relativeSq < minRelevantSq) return 0.0f;
        const float invToleranceSq = 1.0f / (tolerance * tolerance);
        float best = 0.0f;
        for (size_t i = 0; i < referenceCount; ++i) {
            float s = 1.0f - colourDistanceSq(p, references[i]) * invToleranceSq * 0.64f;
            if (blendAxisLengthSq[i] > 1e-6f) {
                const float alpha = colourDot(relative, blendAxis[i]) / blendAxisLengthSq[i];
                const float coverage = smoothStep(0.30f, 0.65f, alpha) * (1.0f - smoothStep(1.35f, 1.90f, alpha));
                if (coverage > 0.0f) {
                    const auto residual = relative - blendAxis[i] * alpha;
                    s = std::max(s, coverage * (1.0f - colourDot(residual, residual) * invToleranceSq));
                }
            }
            best = std::max(best, s);
        }
        return std::clamp(best, 0.0f, 1.0f);
    }

    float directScore(const RGB& pixel) const noexcept {
        const ColourVec p{pixel};
        const float invToleranceSq = 1.0f / (tolerance * tolerance);
        float best = 0.0f;
        for (size_t i = 0; i < referenceCount; ++i) {
            best = std::max(best, 1.0f - colourDistanceSq(p, references[i]) * invToleranceSq * 0.64f);
        }
        return std::clamp(best, 0.0f, 1.0f);
    }
};

inline std::vector<ColourCluster> analyseColours(const ImageData<4>& image, const ColourVec& background) {
    static constexpr uint32_t bits = 5, levels = 1u << bits, binCount = levels * levels * levels;
    static constexpr float mergeDistance = 0.10f, backgroundDistance = 0.06f;
    static constexpr size_t maxClusters = 24;

    struct Bin {
        float r = 0.0f, g = 0.0f, b = 0.0f;
        uint32_t count = 0;
        uint32_t minX = 0xffffffffu, maxX = 0;
    };
    const auto bins = std::make_unique<Bin[]>(binCount);

    const auto width = image.width, height = image.height;
    for (uint32_t y = 0; y < height; ++y) {
        for (uint32_t x = 0; x < width; ++x) {
            const auto rgb = image.getRGB(x, y);
            const ColourVec p{rgb};
            if (colourDistanceSq(p, background) < backgroundDistance * backgroundDistance) continue;
            auto& bin = bins[((rgb.R >> (8 - bits)) << (2 * bits)) | ((rgb.G >> (8 - bits)) << bits) | (rgb.B >> (8 - bits))];
            bin.r += p.r;
            bin.g += p.g;
            bin.b += p.b;
            ++bin.count;
            bin.minX = std::min(bin.minX, x);
            bin.maxX = std::max(bin.maxX, x);
        }
    }

    const uint32_t minimumCount = std::max<uint32_t>(24, (width * height) / 20000);
    std::vector<ColourCluster> found;
    for (uint32_t i = 0; i < binCount; ++i) {
        const auto& bin = bins[i];
        if (bin.count < minimumCount) continue;
        const float inv = 1.0f / static_cast<float>(bin.count);
        found.emplace_back(ColourVec{bin.r * inv, bin.g * inv, bin.b * inv}, bin.count, bin.minX, bin.maxX);
    }
    std::sort(found.begin(), found.end(), [] (const ColourCluster& a, const ColourCluster& b) { return a.count > b.count; });

    std::vector<ColourCluster> clusters;
    for (const auto& candidate : found) {
        bool merged = false;
        for (auto& cluster : clusters) {
            if (colourDistanceSq(cluster.colour, candidate.colour) >= mergeDistance * mergeDistance) continue;
            const auto total = cluster.count + candidate.count;
            cluster.colour = cluster.colour + (candidate.colour - cluster.colour) * (static_cast<float>(candidate.count) / static_cast<float>(total));
            cluster.count = total;
            cluster.minX = std::min(cluster.minX, candidate.minX);
            cluster.maxX = std::max(cluster.maxX, candidate.maxX);
            merged = true;
            break;
        }
        if (!merged && clusters.size() < maxClusters) clusters.push_back(candidate);
    }
    return clusters;
}

namespace tracing {
    constexpr float minPixelScore     = 0.25f;  // below this a pixel is not evidence at all
    constexpr float minRunWeight      = 0.6f;   // total score a run needs to be worth considering
    constexpr size_t maxRunsPerColumn = 4;      // only the strongest runs in a column are kept
    constexpr float hitReward         = 1.0f;   // earned for every column the path explains
    constexpr float gapCost           = 0.35f;   // paid for every column the path skips over
    constexpr float smoothnessWeight  = 1.0f;
    constexpr float bendSharpness     = 4.0f;   // how much dearer, past the allowance
    constexpr float thicknessWeight   = 0.5f;
    constexpr float slopeCarry        = 0.45f;  // how much of the old slope survives into the new one
    constexpr float softSlope         = 6.0f;   // pixels per column before steepness starts costing
    constexpr float slopeWeight       = 0.04f;
    constexpr float deviationLimit    = 12.0f;  // hard cut off, in multiples of the curvature allowance
    constexpr float maxLeap           = 0.20f;  // and never further than this much of the plot in one step
    constexpr float rulePenalty       = 0.60f;  // per column spent sitting on a detected grid rule
    constexpr float minTolerance      = 0.05f;
    constexpr float maxTolerance      = 0.25f;
    constexpr float toleranceFraction = 0.45f;  // of the gap to the nearest other ink colour
    constexpr int maxRefinePasses     = 6;
    constexpr float infinite          = 1e30f;
}

inline bool onHorizontalRule(const std::set<uint32_t>& horizontalLines, const float y) noexcept {
    if (horizontalLines.empty()) return false;
    const auto row = static_cast<uint32_t>(std::max(0.0f, y));
    const auto above = horizontalLines.lower_bound(row);
    if (above != horizontalLines.end() && *above - row <= 2) return true;
    return above != horizontalLines.begin() && row - *std::prev(above) <= 2;
}

struct Candidate {
    float centre = 0.0f;    // score weighted centre of the run, sub pixel
    float peak = 0.0f;      // strongest membership score in the run
    float weight = 0.0f;    // total membership mass of the run
    uint32_t x = 0;
    uint32_t top = 0, bottom = 0;

    constexpr inline uint32_t thickness() const noexcept { return bottom - top + 1; }
};

struct PathState {
    float cost = tracing::infinite;
    float slope = 0.0f;
    bool hasSlope = false;
    int32_t previousColumn = -1;
    uint32_t previousIndex = 0;
};

struct TracedPath {
    std::vector<std::pair<uint32_t, float>> points;  // (x, y) ascending in x
    float cost = tracing::infinite;

    inline bool empty() const noexcept { return points.empty(); }
};

struct Tracer {
    const ImageData<4>& image;
    ColourModel model;
    float lineWidth = 2.0f;
    float curveAllowance = 2.0f;    // how sharply the curve may bend, pixels per column
    uint32_t maxGap = 8;            // longest break in the line the path may cross
    uint32_t columnStride = 1;      // scan every nth column; see scan()
    const std::set<uint32_t>* rules = nullptr;  // detected horizontal rules, if known

    mutable std::vector<float> scores;
    mutable std::vector<Candidate> scratch;

    Tracer(const ImageData<4>& image, ColourModel model)
        : image(image), model(std::move(model)), scores(image.height) {
        maxGap = std::clamp<uint32_t>(image.width / 40, 8, 40);
        setLineWidth(estimateLineWidth());
    }

    void setLineWidth(const float width) noexcept {
        lineWidth = std::clamp(width, 1.0f, std::max(3.0f, image.height / 40.0f));
        curveAllowance = std::max({1.5f, lineWidth, image.height / 300.0f});
    }

    void scoreColumn(const uint32_t x) const {
        for (uint32_t y = 0, height = image.height; y < height; ++y) scores[y] = model.score(image.getRGB(x, y));
    }

    float estimateLineWidth() const {
        const auto width = image.width, height = image.height;
        std::vector<uint32_t> thicknesses;
        for (uint32_t x = 0, step = std::max<uint32_t>(1, width / 40); x < width; x += step) {
            scoreColumn(x);
            for (uint32_t y = 0; y < height;) {
                if (scores[y] < tracing::minPixelScore) { ++y; continue; }
                const uint32_t top = y;
                while (y < height && scores[y] >= tracing::minPixelScore) ++y;
                thicknesses.push_back(y - top);
            }
        }
        if (thicknesses.empty()) return 2.0f;
        const auto middle = thicknesses.begin() + thicknesses.size() / 2;
        std::nth_element(thicknesses.begin(), middle, thicknesses.end());
        return static_cast<float>(*middle);
    }

    void candidatesForColumn(const uint32_t x, std::vector<Candidate>& out) const {
        const auto height = image.height;
        scratch.clear();
        scoreColumn(x);

        for (uint32_t y = 0; y < height;) {
            if (scores[y] < tracing::minPixelScore) { ++y; continue; }
            const uint32_t top = y;
            float weight = 0.0f, moment = 0.0f, peak = 0.0f;
            for (; y < height && scores[y] >= tracing::minPixelScore; ++y) {
                weight += scores[y];
                moment += scores[y] * static_cast<float>(y);
                peak = std::max(peak, scores[y]);
            }
            if (weight < tracing::minRunWeight) continue;
            scratch.emplace_back(moment / weight, peak, weight, x, top, y - 1);
        }

        if (scratch.size() > tracing::maxRunsPerColumn) {
            std::partial_sort(scratch.begin(), scratch.begin() + tracing::maxRunsPerColumn, scratch.end(),
                [] (const Candidate& a, const Candidate& b) { return a.weight > b.weight; });
            scratch.resize(tracing::maxRunsPerColumn);
        }

        const auto tall = static_cast<uint32_t>(std::max(4.0f, lineWidth * 3.0f));
        for (const auto& run : scratch) {
            out.push_back(run);
            if (run.thickness() < tall) continue;
            const float inset = std::min(lineWidth * 0.5f, static_cast<float>(run.thickness() - 1) * 0.5f);
            out.emplace_back(static_cast<float>(run.top) + inset, run.peak, run.weight, x, run.top, run.bottom);
            out.emplace_back(static_cast<float>(run.bottom) - inset, run.peak, run.weight, x, run.top, run.bottom);
        }
    }

    float unaryCost(const Candidate& candidate) const noexcept {
        const float excess = std::max(0.0f, static_cast<float>(candidate.thickness()) - lineWidth * 3.0f);
        const float rule = (rules && onHorizontalRule(*rules, candidate.centre)) ? tracing::rulePenalty : 0.0f;
        return tracing::thicknessWeight * std::min(1.0f, excess / std::max(4.0f, lineWidth * 8.0f))
             + rule
             - tracing::hitReward * candidate.peak;
    }

    TracedPath scan(const uint32_t firstColumn, const int direction, const bool anchored, const float anchorY) const {
        const auto width = image.width;
        if (width == 0 || image.height == 0 || firstColumn >= width) return {};
        const uint32_t stride = std::max<uint32_t>(1, columnStride);
        const uint32_t remaining = (direction > 0) ? (width - firstColumn) : (firstColumn + 1);
        const uint32_t count = (remaining + stride - 1) / stride;
        const float strideF = static_cast<float>(stride);
        const float strideAllowance = curveAllowance * strideF;
        const uint32_t strideGap = std::max<uint32_t>(1, maxGap / stride);

        std::vector<Candidate> candidates;
        std::vector<PathState> states;
        std::vector<uint32_t> columnStart(count + 1, 0);
        std::vector<float> columnMinCost(count, tracing::infinite);
        candidates.reserve(static_cast<size_t>(count) * 4);

        const float anchorRadius = std::max(4.0f, lineWidth * 3.0f);
        float best = tracing::infinite, floorCost = tracing::infinite;
        uint32_t bestIndex = 0;
        bool found = false;

        for (uint32_t s = 0; s < count; ++s) {
            columnStart[s] = static_cast<uint32_t>(candidates.size());
            const uint32_t offset = s * stride;
            candidatesForColumn((direction > 0) ? firstColumn + offset : firstColumn - offset, candidates);
            columnStart[s + 1] = static_cast<uint32_t>(candidates.size());
            states.resize(candidates.size());

            float columnMin = tracing::infinite;
            for (uint32_t j = columnStart[s]; j < columnStart[s + 1]; ++j) {
                const auto& candidate = candidates[j];
                const float unary = unaryCost(candidate);
                auto& state = states[j];

                if (!anchored || (s == 0 && std::abs(candidate.centre - anchorY) <= anchorRadius)) state.cost = unary;

                for (uint32_t gap = 1; gap <= strideGap && gap <= s; ++gap) {
                    const uint32_t previousColumn = s - gap;
                    const float gapPenalty = tracing::gapCost * static_cast<float>(gap - 1);
                    if (state.cost <= floorCost + gapPenalty + unary) break;
                    if (columnMinCost[previousColumn] >= tracing::infinite) continue;

                    const float gapF = static_cast<float>(gap);
                    const float allowance = strideAllowance * gapF;
                    const float limit = std::min(allowance * tracing::deviationLimit + 4.0f,
                                                 static_cast<float>(image.height) * tracing::maxLeap);

                    for (uint32_t i = columnStart[previousColumn]; i < columnStart[previousColumn + 1]; ++i) {
                        const auto& previous = states[i];
                        if (previous.cost >= tracing::infinite) continue;
                        const auto& previousCandidate = candidates[i];

                        const float predicted = previousCandidate.centre + (previous.hasSlope ? previous.slope * gapF : 0.0f);
                        const float deviation = std::abs(candidate.centre - predicted);
                        if (deviation > limit) continue;

                        const float slope = (candidate.centre - previousCandidate.centre) / gapF;
                        const float bend = deviation / allowance;
                        float smoothness = tracing::smoothnessWeight
                                         * ((bend <= 1.0f) ? bend : 1.0f + tracing::bendSharpness * (bend - 1.0f));
                        if (!previous.hasSlope) smoothness *= 0.5f;  // nothing to extrapolate from yet
                        const float total = previous.cost + unary + gapPenalty + smoothness
                                          + tracing::slopeWeight * std::max(0.0f, std::abs(slope) / strideF - tracing::softSlope);
                        if (total >= state.cost) continue;

                        state.cost = total;
                        state.slope = previous.hasSlope ? tracing::slopeCarry * previous.slope + (1.0f - tracing::slopeCarry) * slope : slope;
                        state.hasSlope = true;
                        state.previousColumn = static_cast<int32_t>(previousColumn);
                        state.previousIndex = i;
                    }
                }

                columnMin = std::min(columnMin, state.cost);
                if (state.cost < best) {
                    best = state.cost;
                    bestIndex = j;
                    found = true;
                }
            }
            columnMinCost[s] = columnMin;
            floorCost = std::min(floorCost, columnMin);
        }

        if (!found) return {};

        TracedPath path;
        path.cost = best;
        for (uint32_t index = bestIndex;;) {
            path.points.emplace_back(candidates[index].x, candidates[index].centre);
            if (states[index].previousColumn < 0) break;
            index = states[index].previousIndex;
        }

        if (direction > 0) std::reverse(path.points.begin(), path.points.end());
        return path;
    }

    static void interpolateGaps(std::vector<std::pair<uint32_t, float>>& points) {
        if (points.size() < 2) return;
        std::vector<std::pair<uint32_t, float>> filled;
        filled.reserve(points.back().first - points.front().first + 1);
        for (size_t i = 0, last = points.size() - 1; i < last; ++i) {
            const auto [x, y] = points[i];
            const auto [nextX, nextY] = points[i + 1];
            filled.emplace_back(x, y);
            const auto span = nextX - x;
            for (uint32_t d = 1; d < span; ++d) {
                filled.emplace_back(x + d, y + (nextY - y) * (static_cast<float>(d) / static_cast<float>(span)));
            }
        }
        filled.push_back(points.back());
        points = std::move(filled);
    }

    void refineFrom(const TracedPath& path) {
        if (path.points.size() < 4) return;
        const auto maxRow = static_cast<float>(image.height - 1);
        std::vector<ColourVec> samples;

        for (size_t i = 0, stride = std::max<size_t>(1, path.points.size() / 200); i < path.points.size(); i += stride) {
            const auto [x, y] = path.points[i];
            const auto row = static_cast<uint32_t>(std::clamp(y, 0.0f, maxRow));
            RGB pixel = image.getRGB(x, row);
            float quality = model.directScore(pixel);
            for (const int offset : {-1, 1}) {
                const auto near = static_cast<uint32_t>(std::clamp(static_cast<float>(row) + offset, 0.0f, maxRow));
                if (const auto candidate = image.getRGB(x, near); model.directScore(candidate) > quality) {
                    quality = model.directScore(candidate);
                    pixel = candidate;
                }
            }
            if (quality >= 0.75f) samples.emplace_back(pixel);
        }
        if (samples.empty()) return;

        std::array<ColourVec, ColourModel::maxReferences> refined{};
        size_t used = 0;
        for (size_t part = 0; part < ColourModel::maxReferences; ++part) {
            const size_t from = samples.size() * part / ColourModel::maxReferences;
            const size_t to = samples.size() * (part + 1) / ColourModel::maxReferences;
            if (from >= to) continue;

            ColourVec mean{};
            for (size_t i = from; i < to; ++i) mean = mean + samples[i];
            mean = mean * (1.0f / static_cast<float>(to - from));

            bool duplicate = false;
            for (size_t i = 0; i < used && !duplicate; ++i) duplicate = colourDistanceSq(mean, refined[i]) < 0.01f * 0.01f;
            if (!duplicate) refined[used++] = mean;
        }
        if (used > 0) model.setReferences(refined.data(), used);
    }

    bool agreesWith(const TracedPath& before, const TracedPath& after) const noexcept {
        const float allowed = std::max(2.0f, lineWidth);
        size_t i = 0, j = 0, compared = 0, disagreed = 0;
        while (i < before.points.size() && j < after.points.size()) {
            if (before.points[i].first < after.points[j].first) { ++i; continue; }
            if (before.points[i].first > after.points[j].first) { ++j; continue; }
            if (std::abs(before.points[i].second - after.points[j].second) > allowed) ++disagreed;
            ++compared;
            ++i;
            ++j;
        }
        return compared > 0 && disagreed * 20 <= compared;
    }

    TracedPath converge(auto&& runScan) {
        auto path = runScan();
        for (int pass = 0; pass < tracing::maxRefinePasses; ++pass) {
            const auto covered = path.points.size();
            const auto previousModel = model;
            refineFrom(path);

            auto next = runScan();
            if (next.points.size() <= covered || !agreesWith(path, next)) {
                model = previousModel;
                break;
            }
            path = std::move(next);
            if (path.points.size() * 50 <= covered * 51) break;
        }
        return path;
    }
};

inline float autoTolerance(const ColourVec& colour, const ColourVec& background, const std::vector<ColourCluster>& clusters) {
    float nearest = colourDistance(colour, background);
    for (const auto& cluster : clusters) {
        if (const auto d = colourDistance(colour, cluster.colour); d > 0.10f) nearest = std::min(nearest, d);
    }
    return std::clamp(tracing::toleranceFraction * nearest, tracing::minTolerance, tracing::maxTolerance);
}

inline ColourModel buildModel(const TraceContext& context, const ColourVec& colour) {
    ColourModel model;
    model.background = context.background;
    model.tolerance = autoTolerance(colour, context.background, *context.clusters);
    model.setReferences(&colour, 1);
    return model;
}

inline RGB pickSeedColour(const ImageData<4>& image, const ColourVec& background, const uint32_t x, const uint32_t y) {
    static constexpr float inkDistance = 0.08f, sameColour = 0.05f;
    static constexpr uint32_t equallyNear = 3;
    const auto height = image.height;
    const auto radius = std::max<uint32_t>(4, height / 80);
    const auto maxRun = std::max<uint32_t>(8, height / 25);
    const uint32_t left = (x > 2) ? x - 2 : 0, right = std::min(image.width - 1, x + 2);
    const uint32_t top = (y > radius) ? y - radius : 0, bottom = std::min(height - 1, y + radius);

    RGB strongest = image.getRGB(x, y);
    float strongestDistance = colourDistanceSq(ColourVec{strongest}, background);
    struct Found { RGB colour; uint32_t offset; float distance; };
    std::vector<Found> candidates;
    uint32_t nearestOffset = 0xffffffffu;

    for (uint32_t cx = left; cx <= right; ++cx) {
        for (uint32_t cy = top; cy <= bottom; ++cy) {
            const auto pixel = image.getRGB(cx, cy);
            const ColourVec colour{pixel};
            const auto distance = colourDistanceSq(colour, background);
            if (distance > strongestDistance) {
                strongestDistance = distance;
                strongest = pixel;
            }
            if (distance < inkDistance * inkDistance) continue;

            uint32_t length = 1;
            for (uint32_t up = cy; up-- > 0 && length <= maxRun; ++length) {
                if (colourDistanceSq(ColourVec{image.getRGB(cx, up)}, colour) > sameColour * sameColour) break;
            }
            for (uint32_t down = cy + 1; down < height && length <= maxRun; ++down, ++length) {
                if (colourDistanceSq(ColourVec{image.getRGB(cx, down)}, colour) > sameColour * sameColour) break;
            }
            if (length > maxRun) continue;

            const uint32_t offset = (cy > y) ? cy - y : y - cy;
            nearestOffset = std::min(nearestOffset, offset);
            candidates.emplace_back(pixel, offset, distance);
        }
    }

    RGB best = strongest;
    float bestDistance = -1.0f;
    for (const auto& candidate : candidates) {
        if (candidate.offset > nearestOffset + equallyNear || candidate.distance <= bestDistance) continue;
        bestDistance = candidate.distance;
        best = candidate.colour;
    }
    return best;
}

inline std::optional<std::pair<uint32_t, float>> findAnchor(const Tracer& tracer, const uint32_t x, const uint32_t y) {
    static constexpr int32_t maxOffset = 8;
    const auto width = static_cast<int32_t>(tracer.image.width);
    const float target = static_cast<float>(y), radius = std::max(4.0f, tracer.lineWidth * 3.0f);
    std::vector<Candidate> column;

    for (int32_t offset = 0; offset <= maxOffset; ++offset) {
        for (const int32_t sign : {1, -1}) {
            const int32_t probe = static_cast<int32_t>(x) + sign * offset;
            if (probe < 0 || probe >= width) continue;

            column.clear();
            tracer.candidatesForColumn(static_cast<uint32_t>(probe), column);
            float bestDistance = radius, bestY = 0.0f;
            bool hit = false;
            for (const auto& candidate : column) {
                // The whole run counts as a hit, not just its centre.
                const float distance = std::max({0.0f, static_cast<float>(candidate.top) - target, target - static_cast<float>(candidate.bottom)});
                if (distance > bestDistance) continue;
                bestDistance = distance;
                bestY = candidate.centre;
                hit = true;
            }
            if (hit) return std::make_pair(static_cast<uint32_t>(probe), bestY);
            if (offset == 0) break;
        }
    }
    return std::nullopt;
}

inline void dropRuleDetours(std::vector<std::pair<uint32_t, float>>& points, const std::set<uint32_t>& rules, const uint32_t height);

inline frTrace toTrace(const std::vector<std::pair<uint32_t, float>>& points, const uint32_t height, const uint32_t minimumX) {
    frTrace result;
    const auto maxRow = static_cast<float>(height - 1);
    for (const auto& [x, y] : points) {
        if (x < minimumX) continue;
        result[x] = static_cast<uint32_t>(std::clamp(std::round(y), 0.0f, maxRow));
    }
    return result;
}

inline TracedPath traceThroughAnchor(Tracer& tracer, const uint32_t anchorX, const float anchorY, const bool traceLeft) {
    return tracer.converge([&] {
        auto right = tracer.scan(anchorX, 1, true, anchorY);
        if (!traceLeft) return right;
        // The leftward scan already comes back ascending in x and ends on the
        // anchor column, which the rightward one also covers.
        auto left = tracer.scan(anchorX, -1, true, anchorY);
        if (left.empty()) return right;
        left.points.pop_back();
        left.points.insert(left.points.end(), right.points.begin(), right.points.end());
        right.points = std::move(left.points);
        return right;
    });
}

inline frTrace traceFromPoint(const TraceContext& context, const uint32_t x, const uint32_t y, const bool traceLeft) {
    const auto& image = context.image;
    Tracer tracer{image, buildModel(context, ColourVec{pickSeedColour(image, context.background, x, y)})};
    tracer.rules = &context.horizontalLines;

    const auto anchor = findAnchor(tracer, x, y);
    if (!anchor) return {};
    const auto [anchorX, anchorY] = *anchor;

    auto path = traceThroughAnchor(tracer, anchorX, anchorY, traceLeft);

    dropRuleDetours(path.points, context.horizontalLines, image.height);
    Tracer::interpolateGaps(path.points);
    // Tracing rightwards must leave the trace to the left of the click alone.
    return toTrace(path.points, image.height, traceLeft ? 0 : x);
}

inline void dropRuleDetours(std::vector<std::pair<uint32_t, float>>& points, const std::set<uint32_t>& rules, const uint32_t height) {
    if (points.size() < 3 || rules.empty()) return;
    float plotHeight = static_cast<float>(height);
    if (rules.size() >= 2) {
        const float span = static_cast<float>(*rules.rbegin() - *rules.begin());
        if (span > static_cast<float>(height) * 0.20f) plotHeight = span;
    }
    const float jump = std::max(4.0f, plotHeight * 0.05f);
    const size_t total = points.size();

    struct Block { size_t start, end; float mean, range; uint32_t onRule; };
    std::vector<Block> blocks;
    for (size_t start = 0; start < total;) {
        size_t end = start;
        float lowest = points[start].second, highest = lowest, sum = lowest;
        uint32_t onRule = onHorizontalRule(rules, points[start].second) ? 1 : 0;
        while (end + 1 < total && std::abs(points[end + 1].second - points[end].second) < jump) {
            ++end;
            const float y = points[end].second;
            lowest = std::min(lowest, y);
            highest = std::max(highest, y);
            sum += y;
            if (onHorizontalRule(rules, y)) ++onRule;
        }
        const auto length = static_cast<float>(end - start + 1);
        blocks.emplace_back(start, end, sum / length, highest - lowest, onRule);
        start = end + 1;
    }

    std::vector<bool> drop(total, false);
    size_t dropped = 0;
    for (size_t i = 1; i + 1 < blocks.size(); ++i) {
        const auto& block = blocks[i];
        const size_t length = block.end - block.start + 1;
        if (length < 2 || length * 3 >= total) continue;
        if (block.range > plotHeight * 0.20f) continue;

        const auto [beforeX, beforeY] = points[blocks[i - 1].end];
        const auto [afterX, afterY] = points[blocks[i + 1].start];
        const float span = static_cast<float>(afterX) - static_cast<float>(beforeX);
        const float middle = static_cast<float>(points[block.start].first + points[block.end].first) * 0.5f - static_cast<float>(beforeX);
        const float chord = (span > 0.0f) ? beforeY + (afterY - beforeY) * (middle / span) : beforeY;
        if (std::abs(block.mean - chord) < jump) continue;

        for (size_t j = block.start; j <= block.end; ++j) drop[j] = true;
        dropped += length;
    }
    if (dropped == 0) return;

    std::vector<std::pair<uint32_t, float>> kept;
    kept.reserve(total - dropped);
    for (size_t i = 0; i < total; ++i) if (!drop[i]) kept.push_back(points[i]);
    points = std::move(kept);
}

}