import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ExtractedMemory {
  content: string;
  summary: string;
  topic?: string;
  type: 'decision' | 'definition' | 'question' | 'idea' | 'other';
}

export class SummarizerService {
  async extractMemories(messages: Message[]): Promise<ExtractedMemory[]> {
    if (messages.length === 0) {
      return [];
    }

    const conversationText = messages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    const prompt = `Analyze the following conversation and extract meaningful memories. 
Focus on:
- Key decisions made
- Important definitions or concepts explained
- Open questions that need answers
- Creative ideas or solutions
- Project-specific information

For each memory, provide:
1. A concise summary (1-2 sentences)
2. The relevant topic/project name (if applicable)
3. The type (decision, definition, question, idea, or other)
4. The key content excerpt

Return as JSON object with a "memories" array:
{
  "memories": [
    {
      "summary": "...",
      "topic": "...",
      "type": "decision|definition|question|idea|other",
      "content": "..."
    }
  ]
}

Conversation:
${conversationText}

JSON:`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a memory extraction system. Extract only meaningful, reusable information. Be concise and accurate.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return [];
      }

      // Parse JSON response
      const parsed = JSON.parse(content);
      const memories = Array.isArray(parsed.memories) 
        ? parsed.memories 
        : Array.isArray(parsed) 
        ? parsed 
        : [];

      return memories.map((m: any) => ({
        content: m.content || m.summary,
        summary: m.summary,
        topic: m.topic,
        type: m.type || 'other',
      }));
    } catch (error) {
      console.error('Error extracting memories:', error);
      // Fallback: create a simple summary
      return this.createFallbackMemory(messages);
    }
  }

  private createFallbackMemory(messages: Message[]): ExtractedMemory[] {
    const lastMessages = messages.slice(-3);
    const content = lastMessages.map((m) => m.content).join('\n');
    const summary = `Conversation about: ${content.substring(0, 200)}...`;

    return [
      {
        content,
        summary,
        type: 'other',
      },
    ];
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }
}

