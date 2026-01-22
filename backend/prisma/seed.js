const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create test worker user
  const passwordHash = await bcrypt.hash('password123', 10);
  
  const user = await prisma.user.upsert({
    where: { username: 'worker1' },
    update: {},
    create: {
      username: 'worker1',
      passwordHash,
      role: 'WORKER',
      firstName: 'John',
      lastName: 'Doe',
    },
  });

  const worker = await prisma.worker.upsert({
    where: { userId: user.userId },
    update: {},
    create: {
      userId: user.userId,
      firstName: 'John',
      lastName: 'Doe',
      phoneNumber: '1234567890',
    },
  });

  // Create sample products
  const products = await Promise.all([
    prisma.product.upsert({
      where: { productName: 'Milk (1L)' },
      update: {},
      create: { productName: 'Milk (1L)', price: 50 },
    }),
    prisma.product.upsert({
      where: { productName: 'Curd (500g)' },
      update: {},
      create: { productName: 'Curd (500g)', price: 40 },
    }),
    prisma.product.upsert({
      where: { productName: 'Buttermilk (500ml)' },
      update: {},
      create: { productName: 'Buttermilk (500ml)', price: 20 },
    }),
    prisma.product.upsert({
      where: { productName: 'Paneer (250g)' },
      update: {},
      create: { productName: 'Paneer (250g)', price: 120 },
    }),
  ]);

  // Create sample inventory
  for (const product of products) {
    await prisma.workerInventory.create({
      data: {
        workerId: worker.workerId,
        productId: product.productId,
        quantity: 50,
      },
    });
  }

  // Create sample customers
  await Promise.all([
    prisma.customer.upsert({
      where: { customerId: 1 },
      update: {},
      create: {
        customerName: 'ABC Store',
        address: '123 Main Street',
        phoneNumber: '9876543210',
        classification: 'REGULAR',
      },
    }),
    prisma.customer.upsert({
      where: { customerId: 2 },
      update: {},
      create: {
        customerName: 'XYZ Supermarket',
        address: '456 Park Avenue',
        phoneNumber: '9876543211',
        classification: 'VIP',
      },
    }),
  ]);

  console.log('✅ Database seeded successfully!');
  console.log('📝 Test credentials:');
  console.log('   Phone Number: 1234567890');
  console.log('   Password: password123');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
