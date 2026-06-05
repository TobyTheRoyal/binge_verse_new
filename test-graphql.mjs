import { GraphQLClient } from 'graphql-request';

const client = new GraphQLClient('http://localhost:4000/graphql');

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
  console.log('Success:', data.home ? 'home query returned data' : 'no home data');
} catch (error) {
  console.log('Error:', error.message);
  if (error.response) {
    console.log('Response errors:', error.response.errors);
  }
}
