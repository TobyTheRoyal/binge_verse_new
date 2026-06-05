// Test the data transformation logic

function fromMedia(raw) {
  return {
    id: raw.id,
    media_type: raw.mediaType,
    title: raw.title,
    poster_path: raw.posterPath,
    backdrop_path: raw.backdropPath,
    overview: raw.overview,
    release_date: raw.releaseDate,
    vote_average: raw.voteAverage,
    vote_count: raw.voteCount,
    genre_ids: raw.genreIds,
  };
}

// Simulate the backend response
const homeData = {
  featured: {
    id: 1358005,
    mediaType: "movie",
    title: "Office Romance",
    posterPath: "/9As3SeWOa3bzCjz3PZ4BKSuabMf.jpg",
    backdropPath: "/iK9RjKx53gBEA0W7JbVvefWrBMb.jpg",
    overview: "Test overview",
    releaseDate: "2026-06-04",
    voteAverage: 7.3,
    voteCount: 5,
    genreIds: [10749, 35],
  },
  trending: [
    {
      id: 1358005,
      mediaType: "movie",
      title: "Office Romance",
      posterPath: "/9As3SeWOa3bzCjz3PZ4BKSuabMf.jpg",
      backdropPath: "/iK9RjKx53gBEA0W7JbVvefWrBMb.jpg",
      overview: "Test overview",
      releaseDate: "2026-06-04",
      voteAverage: 7.3,
      voteCount: 5,
      genreIds: [10749, 35],
    }
  ],
  trendingMovies: [],
  trendingTv: [],
  popularMovies: [],
  popularTv: [],
  topMovies: [],
  topTv: [],
};

try {
  const result = {
    featured: homeData.featured ? fromMedia(homeData.featured) : null,
    trending: homeData.trending.map(fromMedia),
    trendingMovies: homeData.trendingMovies.map(fromMedia),
    trendingTv: homeData.trendingTv.map(fromMedia),
    popularMovies: homeData.popularMovies.map(fromMedia),
    popularTv: homeData.popularTv.map(fromMedia),
    topMovies: homeData.topMovies.map(fromMedia),
    topTv: homeData.topTv.map(fromMedia),
  };
  
  console.log('Transformation successful');
  console.log('Featured:', result.featured.title);
  console.log('Trending count:', result.trending.length);
} catch (error) {
  console.log('Transformation error:', error.message);
  console.log('Stack:', error.stack);
}
