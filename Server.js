require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI;
const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

app.use(express.json());
app.use(cors());

// ✅ MongoDB Connection
mongoose.connect(MONGO_URI, {})
    .then(() => console.log("✅ MongoDB Connected"))
    .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// ✅ User Model
const UserSchema = new mongoose.Schema({
    username: String,
    email: String,
    password: String,
});

const User = mongoose.model("User", UserSchema);

// ✅ Sign Up Route
app.post("/signup", async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "Email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, email, password: hashedPassword });
        await newUser.save();

        res.status(201).json({ message: "User registered successfully" });
    } catch (error) {
        res.status(500).json({ message: "Error signing up", error: error.message });
    }
});

// ✅ Sign In Route
app.post("/signin", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "1h" });
        res.json({ message: "Login successful", token });
    } catch (error) {
        res.status(500).json({ message: "Error signing in", error: error.message });
    }
});

// ✅ Get Current Weather (By City or Location)
app.get("/current-weather", async (req, res) => {
    try {
        let { city, lat, lon } = req.query;

        if (!city && (!lat || !lon)) {
            return res.status(400).json({ message: "City or coordinates are required" });
        }

        // ✅ Current Weather API Call
        const url = city
            ? `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${WEATHER_API_KEY}&units=metric`
            : `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric`;

        const response = await axios.get(url);
        const data = response.data;

        // ✅ Get AQI Data
        const aqiResponse = await axios.get(
            `http://api.openweathermap.org/data/2.5/air_pollution?lat=${data.coord.lat}&lon=${data.coord.lon}&appid=${WEATHER_API_KEY}`
        );
        const aqi = aqiResponse.data.list[0].main.aqi;

        const weather = {
            city: data.name,
            temperature: data.main.temp,
            feelsLike: data.main.feels_like,
            humidity: data.main.humidity,
            pressure: data.main.pressure,
            visibility: data.visibility,
            windSpeed: data.wind.speed,
            windDirection: data.wind.deg,
            gust: data.wind.gust || "N/A",
            sunrise: new Date(data.sys.sunrise * 1000).toLocaleTimeString(),
            sunset: new Date(data.sys.sunset * 1000).toLocaleTimeString(),
            uvi: data.uvi || "N/A",
            precipitation: data.rain ? data.rain["1h"] || 0 : 0,
            description: data.weather[0].description,
            aqi: getAQIDescription(aqi),
            alert: getWeatherAlert(data.weather[0].id),
            recommendation: getRecommendation(data),
        };

        res.json(weather);
    } catch (error) {
        res.status(500).json({ message: "Error fetching weather data", error: error.message });
    }
});

// ✅ Get 5-Day Hourly Forecast (By City or Location)
app.get("/5-day-forecast", async (req, res) => {
    try {
        let { city, lat, lon } = req.query;

        if (!city && (!lat || !lon)) {
            return res.status(400).json({ message: "City or coordinates are required" });
        }

        // ✅ 5-Day Forecast API Call
        const url = city
            ? `https://api.openweathermap.org/data/2.5/forecast?q=${city}&appid=${WEATHER_API_KEY}&units=metric`
            : `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric`;

        const response = await axios.get(url);
        const data = response.data;

        const forecast = data.list.map((item) => ({
            dateTime: item.dt_txt,
            temperature: item.main.temp,
            feelsLike: item.main.feels_like,
            humidity: item.main.humidity,
            windSpeed: item.wind.speed,
            windDirection: item.wind.deg,
            description: item.weather[0].description,
            precipitation: item.rain ? item.rain["3h"] || 0 : 0,
            alert: getWeatherAlert(item.weather[0].id),
            recommendation: getRecommendation(item),
        }));

        res.json({ city: data.city.name, forecast });
    } catch (error) {
        res.status(500).json({ message: "Error fetching forecast data", error: error.message });
    }
});

// ✅ AQI Description
const getAQIDescription = (aqi) => {
    const levels = ["Good", "Fair", "Moderate", "Poor", "Very Poor"];
    return levels[aqi - 1] || "Unknown";
};

// ✅ Custom Weather Alert
const getWeatherAlert = (weatherId) => {
    if (weatherId >= 200 && weatherId < 300) return "Thunderstorm warning!";
    if (weatherId >= 300 && weatherId < 600) return "Rain alert! Carry an umbrella.";
    if (weatherId >= 600 && weatherId < 700) return "Snowfall expected.";
    if (weatherId >= 700 && weatherId < 800) return "Low visibility due to fog.";
    if (weatherId === 800) return "Clear sky. Have a great day!";
    if (weatherId > 800) return "Cloudy weather.";
    return "No alerts.";
};

// ✅ Weather-Based Recommendation
const getRecommendation = (data) => {
    if (data.main.temp > 35) return "It's hot! Stay hydrated and avoid sun exposure.";
    if (data.wind.speed > 10) return "High winds! Secure loose items.";
    if (data.weather[0].id >= 300 && data.weather[0].id < 600) return "Carry an umbrella!";
    return "Weather looks good! Enjoy your day.";
};

// ✅ Start Server
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
