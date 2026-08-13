#pragma once

#include <algorithm>
#include <cstddef>
#include <cmath>
#include <cstdint>
#include <iterator>

enum class Compensation : std::uint8_t {
    None = 0,
    BK5128 = 1
};

namespace CompensationTools {
    struct Point {
        double frequency;
        double gain;
    };

    // Inferred 5128 diffuse-field target with a -1 dB/octave tilt. This is not
    // official B&K data. Points are reduced to a maximum interpolation error of
    // 0.05 dB and interpolated on a logarithmic frequency axis.
    static constexpr Point BK5128_TARGET[] = {
        {20, -3.544599}, {60.804018, -3.462181}, {69.242925, -3.51586},
        {70.250086, -3.462504}, {111.515061, -3.407236}, {113.137085, -3.352291},
        {118.146092, -3.407236}, {195.848567, -3.132511}, {236.292183, -2.936728},
        {261.426473, -2.747896}, {265.229008, -2.802841}, {273.000811, -2.692951},
        {302.03978, -2.58306}, {348.962474, -2.297395}, {386.08145, -1.980935},
        {414.988657, -1.868775}, {493.507464, -1.319324}, {586.882588, -0.607094},
        {718.375711, -0.000643}, {728.824726, -0.031007}, {783.394268, 0.15662},
        {794.789, 0.109247}, {958.916529, 0.340304}, {1060.916032, 0.756344},
        {1261.648894, 1.953812}, {1317.506863, 2.171836}, {1522.185107, 3.241115},
        {1684.099226, 4.255137}, {1890.337467, 5.663654}, {2061.427625, 6.948496},
        {2248.002765, 8.414322}, {2597.236057, 11.204014}, {2751.67575, 12.130531},
        {2873.502844, 12.554302}, {3000.723683, 12.664192}, {3088.651599, 12.609247},
        {3272.31238, 12.255533}, {3891.457165, 10.77062}, {4243.66413, 10.191665},
        {4763.351932, 9.670668}, {5194.472115, 9.449907}, {5664.612008, 9.049633},
        {6177.303198, 8.131225}, {6450.795775, 7.8565}, {6736.396904, 7.911445},
        {6933.7884, 8.051255}, {7561.349867, 8.729193}, {7782.91433, 8.872984},
        {8010.971128, 8.900456}, {8127.493386, 8.798498}, {8245.7105, 8.653203},
        {8365.647121, 8.352991}, {8487.32826, 7.910315}, {8610.779292, 7.322344},
        {8992.011061, 5.181935}, {9122.802874, 4.582257}, {9255.497097, 4.13099},
        {9390.121402, 3.900456}, {9526.703863, 3.854672}, {9665.272962, 4.06247},
        {10240, 5.676468}, {10388.94423, 5.909449}, {10540.054903, 5.875923},
        {10693.363532, 5.595695}, {10848.902086, 5.10524}, {11166.799182, 3.824135},
        {11494.011375, 2.73467}, {11661.19562, 2.374145}, {12002.894734, 1.879364},
        {12177.480858, 1.709535}, {12534.308283, 1.565291}, {13279.63704, 1.577834},
        {13668.760107, 1.456789}, {13867.576801, 1.226797}, {14069.28535, 0.86133},
        {14481.546879, -0.09266}, {14692.185828, -0.492649}, {14905.888592, -0.722309},
        {15122.699734, -0.687456}, {15342.664467, -0.50614}, {15792.238852, 0.065121},
        {16021.942256, 0.243947}, {16254.986772, 0.189946}, {16491.420999, -0.029666},
        {16731.294241, -0.384585}, {16974.65652, -0.792899}, {17472.051922, -1.771362},
        {17726.188769, -2.159144}, {17984.022122, -2.458511}, {18245.605748, -2.610533},
        {20186.382308, -2.555588}
    };

    constexpr bool targetIsSorted() noexcept {
        for (std::size_t i = 1; i < std::size(BK5128_TARGET); ++i) {
            if (BK5128_TARGET[i - 1].frequency >= BK5128_TARGET[i].frequency) return false;
        }
        return true;
    }

    static_assert(targetIsSorted(), "BK5128 compensation frequencies must be strictly increasing");

    constexpr Compensation fromInt(const int value) noexcept {
        return value == static_cast<int>(Compensation::BK5128)
            ? Compensation::BK5128
            : Compensation::None;
    }

    inline double getBK5128(const double frequency) noexcept {
        if (!std::isfinite(frequency) || frequency <= 0) return 0;

        if (frequency <= BK5128_TARGET[0].frequency) return BK5128_TARGET[0].gain;
        if (frequency >= BK5128_TARGET[std::size(BK5128_TARGET) - 1].frequency) {
            return BK5128_TARGET[std::size(BK5128_TARGET) - 1].gain;
        }

        const auto upper = std::lower_bound(
            std::begin(BK5128_TARGET),
            std::end(BK5128_TARGET),
            frequency,
            [](const Point& point, const double value) { return point.frequency < value; }
        );
        const auto& lower = *std::prev(upper);
        const auto ratio = std::log(frequency / lower.frequency) / std::log(upper->frequency / lower.frequency);
        return lower.gain + (upper->gain - lower.gain) * ratio;
    }

    inline double apply(const Compensation compensation, const double frequency, const double spl) noexcept {
        switch (compensation) {
            case Compensation::BK5128:
                return spl + getBK5128(frequency);
            case Compensation::None:
            default:
                return spl;
        }
    }
}
