const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const router = express.Router();

const axios = require('axios');

// Get prediction for a stock
router.get('/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    console.log(`Fetching prediction for ${symbol} from Python API...`);

    // Call the Python Flask API
    const pythonApiUrl = process.env.PYTHON_API_URL || 'http://127.0.0.1:5001';

    try {
      const response = await axios.get(`${pythonApiUrl}/predict/${symbol}`);
      const predictionData = response.data;

      if (predictionData.error) {
        return res.status(400).json({ message: predictionData.error });
      }

      const currentPrice = predictionData.current_price;
      const targetPrice = predictionData.prediction;
      const returnPercentage = ((targetPrice - currentPrice) / currentPrice) * 100;

      // Extract sentiment data from the ML API response
      const sentimentScore = predictionData.sentiment_score || 0;
      const sentimentLabel = predictionData.sentiment_label || 'neutral';
      const newsArticlesAnalyzed = predictionData.news_articles_analyzed || 0;

      // Convert sentiment score (-1.5 to 1.5) to a 0–100 percentage for the UI
      const sentimentPct = Math.round(Math.min(100, Math.max(0, ((sentimentScore + 1.5) / 3) * 100)));
      const sentimentStatus = sentimentLabel === 'positive' ? 'Positive'
        : sentimentLabel === 'negative' ? 'Negative' : 'Neutral';

      // Construct the response object matching the frontend interface
      const formattedResponse = {
        symbol: predictionData.symbol,
        currentPrice: currentPrice,
        targetPrice: targetPrice,
        confidence: predictionData.confidence,
        modelUsed: predictionData.model_used || 'unknown',
        risk: returnPercentage > 5 ? 'High' : returnPercentage > 2 ? 'Medium' : 'Low',
        expectedReturn: parseFloat(returnPercentage.toFixed(2)),
        sentimentScore: sentimentScore,
        sentimentLabel: sentimentLabel,
        newsArticlesAnalyzed: newsArticlesAnalyzed,
        factors: [
          {
            name: 'Technical Analysis',
            score: 85,
            status: returnPercentage > 0 ? 'Positive' : 'Negative',
            description: returnPercentage > 0 ? 'Bullish signals detected' : 'Bearish signals detected'
          },
          {
            name: 'News Sentiment',
            score: sentimentPct,
            status: sentimentStatus,
            description: newsArticlesAnalyzed > 0
              ? `${newsArticlesAnalyzed} article${newsArticlesAnalyzed > 1 ? 's' : ''} analyzed — overall ${sentimentLabel} sentiment`
              : 'No recent news found for this company'
          },
          {
            name: 'Market Context',
            score: 72,
            status: 'Neutral',
            description: 'Model incorporates Nifty/IT sector trends'
          },
          {
            name: 'AI Model Confidence',
            score: Math.round(predictionData.confidence),
            status: predictionData.confidence > 70 ? 'Positive' : 'Neutral',
            description: `Per-company XGBoost model (${predictionData.model_used || 'default'})`
          }
        ]
      };

      res.json(formattedResponse);

    } catch (apiError) {
      console.error('Python API error:', apiError.message);
      if (apiError.code === 'ECONNREFUSED') {
        return res.status(503).json({
          message: 'Prediction service unavailable. Is the Python server running?',
          hint: 'Run "python app.py" in ml-model directory'
        });
      }
      throw apiError;
    }

  } catch (error) {
    console.error('Server error during prediction:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;