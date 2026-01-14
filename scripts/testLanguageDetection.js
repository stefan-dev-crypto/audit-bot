/**
 * Test Language Detection
 * Verifies that non-Solidity contracts are properly detected
 */

import { detectContractLanguage, isSolidityContract } from '../src/utils/contractValidator.js';

function testLanguageDetection() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           Contract Language Detection Test                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const testCases = [
    {
      name: 'Solidity contract with pragma',
      code: 'pragma solidity ^0.8.0;\ncontract MyContract {}',
      expected: 'Solidity',
    },
    {
      name: 'Vyper contract with @version',
      code: '# @version 0.3.7\n@external\ndef foo():\n    pass',
      expected: 'Vyper',
    },
    {
      name: 'Vyper contract with Python comments',
      code: '# Comment 1\n# Comment 2\n# Comment 3\n# Comment 4\n# Comment 5\n# Comment 6\n@external\ndef foo():\n    pass',
      expected: 'Vyper',
    },
    {
      name: 'Yul assembly code',
      code: 'object "Runtime" {\n    code {\n        mstore(0, 1)\n    }\n}',
      expected: 'Yul',
    },
    {
      name: 'Solidity without pragma',
      code: 'contract Test { function foo() public {} }',
      expected: 'Solidity',
    },
    {
      name: 'Empty contract',
      code: '',
      expected: 'Empty',
    },
    {
      name: 'Unknown format',
      code: 'some random text without clear markers',
      expected: 'Unknown',
    },
  ];

  let passed = 0;
  let failed = 0;

  testCases.forEach(testCase => {
    const detected = detectContractLanguage(testCase.code);
    const isSolidity = isSolidityContract(testCase.code);
    const status = detected === testCase.expected ? '✅' : '❌';
    
    console.log(`${status} ${testCase.name}`);
    console.log(`   Expected: ${testCase.expected}`);
    console.log(`   Detected: ${detected}`);
    console.log(`   Is Solidity: ${isSolidity}`);
    console.log('');

    if (detected === testCase.expected) {
      passed++;
    } else {
      failed++;
    }
  });

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    Test Summary                               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`Total tests: ${testCases.length}`);
  console.log(`Passed: ✅ ${passed}`);
  console.log(`Failed: ❌ ${failed}\n`);

  if (failed > 0) {
    console.log('❌ Some tests failed!');
    process.exit(1);
  } else {
    console.log('🎉 All tests passed!');
  }
}

testLanguageDetection();
