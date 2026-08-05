import mongoose from 'mongoose';

export async function connectDb(uri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  console.log(`[db] connected to ${mongoose.connection.host}/${mongoose.connection.name}`);
  return mongoose.connection;
}

export function disconnectDb() {
  return mongoose.disconnect();
}
