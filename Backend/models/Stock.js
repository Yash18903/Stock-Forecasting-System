const mongoose = require('mongoose');

const StockSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  change: {
    type: Number,
    required: true
  },
  changePercent: {
    type: Number,
    required: true
  },
  marketCap: {
    type: String,
    required: true
  },
  volume: {
    type: String,
    required: true
  },
  high52: {
    type: Number,
    required: true
  },
  low52: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

// Index for efficient queries
StockSchema.index({ symbol: 1 });
StockSchema.index({ lastUpdated: 1 });

module.exports = mongoose.model('Stock', StockSchema);