/**
 * Manual test for HTTP transport endpoints
 *
 * To run:
 * 1. Start the server: cd remote && PORT=3001 SKIP_HEALTH_CHECKS=true npm start
 * 2. Run this test: npx tsx tests/manual/remote/http-endpoints.manual.test.ts
 */

import type { Tool } from '../../../shared/types.js';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001';

async function testHealthEndpoint() {
  console.log('\n=== Testing Health Endpoint ===');
  
  try {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();
    
    console.log('✅ Health endpoint returned:', {
      status: response.status,
      data,
    });
    
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }
    
    if (data.status !== 'healthy') {
      throw new Error(`Expected healthy status, got ${data.status}`);
    }
    
    console.log('✅ Health check passed');
  } catch (error) {
    console.error('❌ Health check failed:', error);
    throw error;
  }
}

async function testMCPInitialization() {
  console.log('\n=== Testing MCP Initialization ===');
  
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: {
        name: 'manual-test-client',
        version: '1.0.0',
      },
    },
  };
  
  try {
    const response = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(initRequest),
    });
    
    const sessionId = response.headers.get('mcp-session-id');
    const data = await response.json();
    
    console.log('✅ Initialize response:', {
      status: response.status,
      sessionId,
      data,
    });
    
    if (!sessionId) {
      throw new Error('No session ID in response');
    }
    
    console.log('✅ MCP initialization successful');
    return sessionId;
  } catch (error) {
    console.error('❌ MCP initialization failed:', error);
    throw error;
  }
}

async function testToolsList(sessionId: string) {
  console.log('\n=== Testing Tools List ===');
  
  const request = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
  };
  
  try {
    const response = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Mcp-Session-Id': sessionId,
      },
      body: JSON.stringify(request),
    });
    
    const data = await response.json();

    const rawTools = data.result?.tools ?? [];
    const tools = rawTools as Tool[];
    const toolNames = tools.map((tool) => (tool as { name: string }).name);

    console.log('✅ Tools list response:', {
      status: response.status,
      toolCount: tools.length,
      tools: toolNames,
    });
    
    if (!data.result?.tools) {
      throw new Error('No tools in response');
    }
    
    console.log('✅ Tools list successful');
    return data.result.tools;
  } catch (error) {
    console.error('❌ Tools list failed:', error);
    throw error;
  }
}

async function testResourcesList(sessionId: string) {
  console.log('\n=== Testing Resources List ===');
  
  const request = {
    jsonrpc: '2.0',
    id: 3,
    method: 'resources/list',
  };
  
  try {
    const response = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Mcp-Session-Id': sessionId,
      },
      body: JSON.stringify(request),
    });
    
    const data = await response.json();
    
    console.log('✅ Resources list response:', {
      status: response.status,
      resourceCount: data.result?.resources?.length || 0,
    });
    
    console.log('✅ Resources list successful');
    return data.result?.resources || [];
  } catch (error) {
    console.error('❌ Resources list failed:', error);
    throw error;
  }
}

async function testInvalidSession() {
  console.log('\n=== Testing Invalid Session Handling ===');
  
  const request = {
    jsonrpc: '2.0',
    id: 99,
    method: 'tools/list',
  };
  
  try {
    const response = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Mcp-Session-Id': 'invalid-session-id',
      },
      body: JSON.stringify(request),
    });
    
    const data = await response.json();
    
    console.log('✅ Invalid session response:', {
      status: response.status,
      error: data.error,
    });
    
    if (response.status !== 400 && response.status !== 404) {
      throw new Error(`Expected 400 or 404, got ${response.status}`);
    }
    
    console.log('✅ Invalid session correctly rejected');
  } catch (error) {
    console.error('❌ Invalid session test failed:', error);
    throw error;
  }
}

async function runAllTests() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('HTTP Transport Manual Tests');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`${'='.repeat(60)}`);
  
  try {
    // Test 1: Health endpoint
    await testHealthEndpoint();
    
    // Test 2: MCP initialization
    const sessionId = await testMCPInitialization();
    
    // Test 3: Tools list
    await testToolsList(sessionId);
    
    // Test 4: Resources list
    await testResourcesList(sessionId);
    
    // Test 5: Invalid session
    await testInvalidSession();
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('✅ ALL TESTS PASSED');
    console.log(`${'='.repeat(60)}\n`);
    
    process.exit(0);
  } catch (error) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('❌ TESTS FAILED');
    console.log(`${'='.repeat(60)}\n`);
    console.error(error);
    process.exit(1);
  }
}

// Run tests
runAllTests();
