import OpenAI from 'openai';
import fs from 'fs';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

console.log('\n📤 Testing OpenAI File Upload API');
console.log('==================================\n');

// Create a small test file
const testContent = `pragma solidity ^0.8.0;

contract TestContract {
    function hello() public pure returns (string memory) {
        return "Hello World";
    }
}`;

fs.writeFileSync('test-contract.sol', testContent);

async function testUpload() {
  try {
    console.log('1. Uploading file...');
    const file = await client.files.create({
      file: fs.createReadStream('test-contract.sol'),
      purpose: "user_data",
    });
    console.log(`   ✅ File uploaded: ${file.id}`);
    
    console.log('\n2. Creating response with file...');
    const response = await client.responses.create({
      model: 'gpt-4.1',
      response_format: { type: 'json_object' },
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_file',
              file_id: file.id,
            },
            {
              type: 'input_text',
              text: 'Analyze this Solidity contract and return JSON with {"analysis": "your analysis here"}',
            },
          ],
        },
      ],
    });
    console.log(`   ✅ Response received`);
    console.log(`   Output: ${response.output_text.slice(0, 200)}...`);
    
    console.log('\n3. Cleaning up...');
    await client.files.del(file.id);
    console.log(`   ✅ File deleted`);
    
    fs.unlinkSync('test-contract.sol');
    console.log(`   ✅ Local file deleted`);
    
    console.log('\n✅ File upload API works correctly!\n');
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    fs.unlinkSync('test-contract.sol');
  }
}

testUpload();

