# Contributing to Memory Layer

Thank you for your interest in contributing!

## Development Setup

1. Follow the setup instructions in `SETUP.md`
2. Make sure all three components are running:
   - Backend: `cd backend && npm run dev`
   - Dashboard: `cd dashboard && npm run dev`
   - Extension: `cd extension && npm run dev` (watch mode)

## Code Style

- **TypeScript**: Use strict mode, prefer interfaces over types for object shapes
- **React**: Functional components with hooks
- **Backend**: Express routes, async/await, error handling
- **Formatting**: Follow existing code style, use meaningful variable names

## Project Structure

- `extension/` - Chrome extension (TypeScript + React)
- `backend/` - Node.js API (TypeScript + Express)
- `dashboard/` - Web dashboard (React + Vite)

## Making Changes

1. Create a feature branch
2. Make your changes
3. Test locally:
   - Backend API endpoints
   - Extension on chat.openai.com
   - Dashboard functionality
4. Submit a pull request

## Areas for Contribution

- Support for other AI chat platforms (Claude, etc.)
- Improved message extraction (better DOM selectors)
- Enhanced summarization prompts
- UI/UX improvements
- Performance optimizations
- Documentation improvements
- Tests (unit, integration)

## Questions?

Open an issue for discussion!


