const mongoose = require("mongoose");

const weatherSchema = new mongoose.Schema({
    city: String,
    country: String,
    forecast: [
        {
            date: String,
            temperature: Number,
            weather: String,
            wind_speed: Number,
            humidity: Number,
        },
    ],
    createdAt: { type: Date, default: Date.now }, // Auto timestamp
});

module.exports = mongoose.model("Weather", weatherSchema);
