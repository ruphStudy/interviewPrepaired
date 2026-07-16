const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

const uri = 'mongodb://localhost:27017';
const dbName = 'interview-coach';

async function setupAdminUser() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db(dbName);
    const users = db.collection('users');
    
    // Check if test user exists
    let testUser = await users.findOne({ email: 'test@example.com' });
    
    if (!testUser) {
      console.log('📝 Creating test user...');
      
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('password123', salt);
      
      // Create test user
      const result = await users.insertOne({
        name: 'Test User',
        email: 'test@example.com',
        password: hashedPassword,
        role: 'admin',
        isActive: true,
        isVerified: true,
        preferences: {
          notifications: true,
          theme: 'auto'
        },
        stats: {
          totalInterviews: 0,
          completedInterviews: 0,
          averageScore: 0
        },
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      console.log('✅ Created admin user:');
      console.log('   Email: test@example.com');
      console.log('   Password: password123');
      console.log('   Role: admin');
      console.log('   ID:', result.insertedId);
    } else if (testUser.role !== 'admin') {
      // Promote existing user to admin
      console.log('📝 Promoting test user to admin...');
      
      await users.updateOne(
        { email: 'test@example.com' },
        { $set: { role: 'admin', updatedAt: new Date() } }
      );
      
      console.log('✅ Promoted test@example.com to admin');
    } else {
      console.log('✅ Admin user already exists');
      console.log('   Email: test@example.com');
      console.log('   Role: admin');
    }
    
    console.log('\n🎉 Setup complete!');
    console.log('\nYou can now login with:');
    console.log('Email: test@example.com');
    console.log('Password: password123');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
  }
}

setupAdminUser();
