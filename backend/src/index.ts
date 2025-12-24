import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { conversationRoutes } from './routes/conversations';
import { memoryRoutes } from './routes/memories';
import { initializeDatabase } from './db/init';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// API routes
app.use('/api/conversations', conversationRoutes);
app.use('/api/memories', memoryRoutes);

// Initialize database and start server
initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Memory Layer backend running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });


