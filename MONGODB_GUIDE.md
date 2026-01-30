# MongoDB Integration Guide (Optional)

This document explains how to add MongoDB support to the Audio Sampler backend.

**Note:** This is completely optional. The current file system storage works perfectly for production.

---

## Current State

The backend currently stores presets as:
- **JSON files**: `backend/public/presets/{preset-name}/preset.json`
- **Audio files**: `backend/public/presets/{preset-name}/{audio-files}`

This works well and requires no database setup.

---

## When MongoDB is Useful

Use MongoDB if you need:
- Multi-user support (each user has their own presets)
- Complex queries (search by date, tags, etc.)
- User authentication and authorization
- Advanced analytics
- Distributed database across regions

---

## Quick Setup (30 minutes)

### Step 1: Create MongoDB Cloud Account

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Sign up for free account
3. Create a new cluster (choose "M0" free tier)
4. Get connection string from "Connect" button
   - Example: `mongodb+srv://username:password@cluster.mongodb.net/sampler`

### Step 2: Install Dependencies

```bash
cd backend
npm install mongoose dotenv
```

### Step 3: Update .env

```env
# In backend/.env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/sampler
NODE_ENV=production
PORT=3000
CORS_ORIGINS=https://audio-sampler-admin-app.vercel.app,https://audio-sampler-pads.vercel.app
```

### Step 4: Create Mongoose Schema

Create `backend/src/models/Preset.js`:

```javascript
import mongoose from 'mongoose';

const PresetSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['Drumkit', 'Instrument', 'FX', 'Sample', 'custom'],
    default: 'custom'
  },
  description: String,
  tags: [String],
  samples: [
    {
      name: String,
      url: String,
      duration: Number,
      fileSize: Number
    }
  ],
  isFactoryPresets: {
    type: Boolean,
    default: false
  },
  author: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

export const Preset = mongoose.model('Preset', PresetSchema);
```

### Step 5: Update App Configuration

In `backend/src/app.mjs`, add MongoDB connection:

```javascript
import mongoose from 'mongoose';
import { Preset } from './models/Preset.js';

// Connect to MongoDB
if (config.isProduction && process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB error:', err));
}
```

### Step 6: Update API Endpoints

Replace file-based endpoints with MongoDB queries:

```javascript
// GET all presets
app.get('/api/presets', async (req, res) => {
  try {
    const presets = await Preset.find({});
    res.json(presets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single preset
app.get('/api/presets/:name', async (req, res) => {
  try {
    const preset = await Preset.findOne({ name: req.params.name });
    if (!preset) return res.status(404).json({ error: 'Not found' });
    res.json(preset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new preset
app.post('/api/presets', async (req, res) => {
  try {
    const preset = new Preset(req.body);
    await preset.save();
    res.status(201).json(preset);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update preset
app.put('/api/presets/:name', async (req, res) => {
  try {
    const preset = await Preset.findOneAndUpdate(
      { name: req.params.name },
      req.body,
      { new: true }
    );
    res.json(preset);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE preset
app.delete('/api/presets/:name', async (req, res) => {
  try {
    await Preset.findOneAndDelete({ name: req.params.name });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
```

### Step 7: Deploy to Render

1. On Render dashboard
2. Go to Environment variables
3. Add `MONGODB_URI` with your connection string
4. Deploy and test

---

## Migration from File System

To migrate existing presets to MongoDB:

```javascript
// Migration script
import fs from 'fs/promises';
import path from 'path';
import { Preset } from './models/Preset.js';

async function migrate() {
  const presetsDir = './public/presets';
  const dirs = await fs.readdir(presetsDir);
  
  for (const dir of dirs) {
    const jsonFile = path.join(presetsDir, dir, 'preset.json');
    try {
      const data = JSON.parse(await fs.readFile(jsonFile, 'utf-8'));
      await Preset.create(data);
      console.log(`Migrated: ${dir}`);
    } catch (err) {
      console.error(`Error migrating ${dir}:`, err.message);
    }
  }
  
  console.log('Migration complete!');
}
```

---

## Benefits of MongoDB vs File System

| Feature | File System | MongoDB |
|---------|------------|---------|
| **Setup time** | 0 minutes | 30 minutes |
| **Scalability** | Limited (file I/O) | High (cloud database) |
| **Multi-user** | No | Yes |
| **Backup** | Manual | Automatic |
| **Cost** | Free | Free (M0 tier) |
| **Queries** | Slow | Fast with indexes |
| **Replication** | No | Yes |

---

## Important Notes

1. **Audio files still live on Render storage**
   - MongoDB stores metadata only
   - Audio files served from `/presets/{name}/*.wav`

2. **Keep file system for audio**
   - Don't store audio in MongoDB (slow)
   - Store file paths/URLs in MongoDB

3. **Indexing is important**
   ```javascript
   PresetSchema.index({ name: 1 });
   PresetSchema.index({ tags: 1 });
   PresetSchema.index({ createdAt: -1 });
   ```

4. **Validation**
   ```javascript
   const presetSchema = new mongoose.Schema({
     name: {
       type: String,
       required: [true, 'Preset name required'],
       minlength: [2, 'Name too short'],
       maxlength: [100, 'Name too long']
     }
   });
   ```

---

## Testing MongoDB Locally

```bash
# Install MongoDB Community Edition
# macOS: brew install mongodb-community
# Windows: Download from mongodb.com

# Start local MongoDB
mongod

# In .env for development
MONGODB_URI=mongodb://localhost:27017/sampler

# Run tests
npm test
```

---

## Troubleshooting

### Connection timeout
- Check internet connection
- Verify IP whitelist on MongoDB Atlas
- Check credentials in connection string

### Duplicate key error
- Preset name must be unique
- Remove `unique: true` if allowing duplicates

### Files not found
- Ensure audio files still exist in `/presets/`
- Update URLs in database if files moved

---

## Summary

MongoDB is **optional** and can be added anytime:
- ✅ File system works perfectly now
- ✅ MongoDB adds multi-user capability
- ✅ Takes ~30 minutes to implement
- ✅ Free cloud tier available

**Current recommendation:** Keep file system for MVP, add MongoDB later if needed for user authentication.
