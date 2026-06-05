import { GraphQLClient } from 'graphql-request';

// This simulates how the client is instantiated in the browser
const client = new GraphQLClient('/graphql');

try {
  const query = `
    query Home {
      home {
        featured { id title }
        trending { id title }
      }
    }
  `;
  
  const data = await client.request(query);
  console.log('Success with relative URL:', data.home ? 'home query returned data' : 'no home data');
} catch (error) {
  console.log('Error:', error.message);
}
