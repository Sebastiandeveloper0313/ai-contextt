# Deploying Memory Layer Backend

You're right - running the backend locally means your computer needs to be on all the time. Let's deploy it to a cloud service.

## Recommended: Vercel (Easiest & Free)

Vercel is perfect for Node.js backends and has a generous free tier.

### Step 1: Prepare for Deployment

1. **Create `vercel.json`** in the `backend/` folder:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "dist/index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "dist/index.js"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

2. **Update package.json** to include a start script:

```json
{
  "scripts": {
    "start": "node dist/index.js",
    "build": "tsc",
    "vercel-build": "npm run build"
  }
}
```

### Step 2: Deploy to Vercel

1. **Install Vercel CLI**:
```bash
npm install -g vercel
```

2. **Login**:
```bash
vercel login
```

3. **Deploy** (from `backend/` directory):
```bash
cd backend
vercel
```

4. **Set Environment Variables**:
   - Go to [vercel.com/dashboard](https://vercel.com/dashboard)
   - Select your project
   - Go to Settings → Environment Variables
   - Add:
     - `SUPABASE_URL` = your Supabase project URL
     - `SUPABASE_SERVICE_ROLE_KEY` = your service role key
     - `OPENAI_API_KEY` = your OpenAI API key
     - `PORT` = (optional, Vercel sets this automatically)

5. **Redeploy** after adding env vars:
```bash
vercel --prod
```

6. **Get your deployment URL** (looks like `https://your-project.vercel.app`)

### Step 3: Update Extension

Update `extension/src/content.ts`:
```typescript
private readonly BACKEND_URL = 'https://your-project.vercel.app';
```

Rebuild the extension:
```bash
cd extension
npm run build
```

Reload the extension in Chrome.

---

## Alternative: Railway (Also Great)

1. Go to [railway.app](https://railway.app)
2. Sign up/login
3. Click "New Project" → "Deploy from GitHub repo"
4. Connect your GitHub repo
5. Select the `backend/` folder as root
6. Add environment variables in Railway dashboard
7. Deploy!

Railway gives you a URL like `https://your-project.railway.app`

---

## Alternative: Render

1. Go to [render.com](https://render.com)
2. Sign up/login
3. Click "New" → "Web Service"
4. Connect your GitHub repo
5. Settings:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `node dist/index.js`
   - **Environment**: Node
6. Add environment variables
7. Deploy!

---

## After Deployment

1. **Update Extension Backend URL**:
   - Edit `extension/src/content.ts`
   - Change `BACKEND_URL` to your deployed URL
   - Rebuild: `cd extension && npm run build`
   - Reload extension in Chrome

2. **Test**:
   - Go to `https://your-deployed-url.vercel.app/health`
   - Should return `{"status":"ok"}`

3. **Use It**:
   - Extension will now work even when your computer is off!
   - All data goes to Supabase (cloud database)

---

## Cost

- **Vercel**: Free tier (100GB bandwidth/month, unlimited requests)
- **Railway**: $5/month after free trial (or free with GitHub Student Pack)
- **Render**: Free tier available (with limitations)

For this project, **Vercel's free tier is more than enough**.


