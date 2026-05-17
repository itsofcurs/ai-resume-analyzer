const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/talentdb';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    const collection = mongoose.connection.db.collection('resumes');
    const res = await collection.updateOne(
      { filename: 'resume (2).pdf' },
      { $set: { status: 'PENDING' } }
    );
    console.log('RESET STATUS SUCCESS:', res.modifiedCount);
    mongoose.disconnect();
    process.exit(0);
  })
  .catch(e => {
    console.error('ERROR:', e.message);
    process.exit(1);
  });
