import { GraphQLClient } from 'graphql-request';

const client = new GraphQLClient('http://localhost:4000/graphql');

const MEDIA_FIELDS = `
  id
  mediaType
  title
  posterPath
  backdropPath
  overview
  releaseDate
  voteAverage
  voteCount
  genreIds
`;

const query = `
  query Home {
    home {
      featured { ${MEDIA_FIELDS} }
      trending { ${MEDIA_FIELDS} }
      trendingMovies { ${MEDIA_FIELDS} }
      trendingTv { ${MEDIA_FIELDS} }
      popularMovies { ${MEDIA_FIELDS} }
      popularTv { ${MEDIA_FIELDS} }
      topMovies { ${MEDIA_FIELDS} }
      topTv { ${MEDIA_FIELDS} }
    }
  }
`;

try {
  const data = await client.request(query);
  console.log('Raw response received');
  console.log('Has home:', !!data.home);
  console.log('Featured:', data.home.featured ? data.home.featured.title : 'null');
  console.log('Trending items:', data.home.trending.length);
} catch (error) {
  console.log('Error:', error.message);
  if (error.response?.errors) {
    console.log('GraphQL errors:', error.response.errors);
  }
}
