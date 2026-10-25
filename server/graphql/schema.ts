import {
  MEDIA_TYPES,
  WATCH_STATUSES,
  USER_ROLES,
  RELEASE_TYPES,
  PUBLICATION_STATUSES,
  CONFIRMATION_STATUSES,
  DATE_PRECISIONS,
} from "../../shared/catalog.js";
export const typeDefs = /* GraphQL */ `
  enum MediaType { ${MEDIA_TYPES.join(" ")} }

  enum WatchStatus { ${WATCH_STATUSES.join(" ")} }

  enum UserRole { ${USER_ROLES.join(" ")} }

  enum ReleaseType { ${RELEASE_TYPES.join(" ")} }

  enum PublicationStatus { ${PUBLICATION_STATUSES.join(" ")} }

  enum ConfirmationStatus { ${CONFIRMATION_STATUSES.join(" ")} }

  enum DatePrecision { ${DATE_PRECISIONS.join(" ")} }

  type MediaItem {
    id: Int!
    mediaType: MediaType!
    title: String!
    posterPath: String
    backdropPath: String
    overview: String!
    releaseDate: String
    popularity: Float!
    voteAverage: Float!
    voteCount: Int!
    genreIds: [Int!]!
    matchScore: MatchScore
  }

  type MatchScore {
    score: Int
    label: String!
    color: String!
    confidence: Int!
    tasteScore: Int
    communityScore: Int
    communityRatingCount: Int!
    similarUserScore: Int
    similarUserCount: Int!
    reasons: [String!]!
    insufficientData: Boolean!
  }

  type TastePreference {
    id: String!
    name: String!
    score: Int!
    observations: Int!
    averageRating: Float!
  }

  type TasteDNAProfile {
    userId: ID!
    computedAt: Float!
    ratingCount: Int!
    confidence: Int!
    averageRating: Float!
    summary: String!
    favoriteMediaType: MediaType
    genrePreferences: [TastePreference!]!
    actorPreferences: [TastePreference!]!
    directorPreferences: [TastePreference!]!
    storyPreferences: [TastePreference!]!
    excludedGenres: [Int!]!
    useViewingSignals: Boolean!
  }

  type RatingBucket {
    rating: Float!
    count: Int!
  }

  type BingeStats {
    userId: ID!
    moviesWatched: Int!
    tvSeriesWatched: Int!
    episodesWatched: Int!
    moviesRated: Int!
    seriesRated: Int!
    averageRating: Float!
    estimatedMinutesWatched: Int!
    ratingDistribution: [RatingBucket!]!
    topRatedMovies: [RatingEntry!]!
    topRatedSeries: [RatingEntry!]!
    completedSeries: Int!
    watchingSeries: Int!
  }

  type BingeRecommendationSection {
    title: String!
    subtitle: String
    items: [MediaItem!]!
  }

  input MatchScoreInput {
    tmdbId: Int!
    mediaType: MediaType!
    title: String
    overview: String
    voteAverage: Float
    popularity: Float
    genreIds: [Int!]
  }

  type Genre {
    id: Int!
    name: String!
  }

  type CastMember {
    id: Int!
    name: String!
    character: String
    profilePath: String
  }

  type Provider {
    providerId: Int!
    providerName: String!
    logoPath: String
  }

  type WatchProviders {
    link: String
    region: String!
    flatrate: [Provider!]!
    rent: [Provider!]!
    buy: [Provider!]!
  }

  type Season {
    seasonNumber: Int!
    name: String!
    overview: String!
    posterPath: String
    airDate: String
    episodeCount: Int!
  }

  type Episode {
    seasonNumber: Int!
    episodeNumber: Int!
    name: String!
    overview: String!
    airDate: String
    runtime: Int
    stillPath: String
    voteAverage: Float!
    watched: Boolean!
    watchedAt: Float
  }

  type SeasonDetails {
    seasonNumber: Int!
    name: String!
    overview: String!
    posterPath: String
    airDate: String
    episodeCount: Int!
    episodes: [Episode!]!
  }

  type MovieDetails {
    id: Int!
    mediaType: MediaType!
    title: String!
    tagline: String
    overview: String!
    posterPath: String
    backdropPath: String
    releaseDate: String
    runtime: Int
    numberOfSeasons: Int
    numberOfEpisodes: Int
    genres: [Genre!]!
    seasons: [Season!]!
    voteAverage: Float!
    voteCount: Int!
    imdbRating: String
    rottenTomatoesRating: String
    imdbId: String
    cast: [CastMember!]!
    recommendations: [MediaItem!]!
    watchProviders: WatchProviders
    trailerKey: String
    myRating: Float
    inWatchlist: Boolean!
    matchScore: MatchScore
  }

  type HomeData {
    featured: MediaItem
    trending: [MediaItem!]!
    trendingMovies: [MediaItem!]!
    trendingTv: [MediaItem!]!
    popularMovies: [MediaItem!]!
    popularTv: [MediaItem!]!
    topMovies: [MediaItem!]!
    topTv: [MediaItem!]!
  }

  type MediaItemConnection {
    results: [MediaItem!]!
    page: Int!
    totalPages: Int!
    totalResults: Int!
  }

  type UserProfile {
    id: ID!
    name: String!
    email: String!
    role: UserRole!
    isAdmin: Boolean!
    isDemo: Boolean!
  }

  type AuthPayload {
    user: UserProfile!
  }

  type SavedItem {
    id: ID!
    tmdbId: Int!
    mediaType: MediaType!
    title: String!
    posterPath: String
    releaseDate: String
    voteAverage: Float!
    addedAt: Float!
  }

  type RatingEntry {
    id: ID!
    tmdbId: Int!
    mediaType: MediaType!
    seasonNumber: Int
    title: String!
    posterPath: String
    releaseDate: String
    voteAverage: Float!
    addedAt: Float!
    rating: Float!
    ratedAt: Float!
  }

  type WatchProgress {
    id: ID!
    tmdbId: Int!
    mediaType: MediaType!
    title: String!
    posterPath: String
    releaseDate: String
    voteAverage: Float!
    status: WatchStatus!
    totalEpisodes: Int!
    watchedEpisodes: Int!
    watchedAt: Float
    lastActivityAt: Float!
    nextEpisode: Episode
  }

  type ReleaseEvent {
    id: ID!
    tmdbId: Int!
    mediaType: MediaType!
    title: String!
    posterPath: String
    backdropPath: String
    voteAverage: Float!
    popularity: Float!
    genreIds: [Int!]!
    provider: String!
    region: String!
    releaseDate: String
    datePrecision: DatePrecision!
    releaseYear: Int
    releaseMonth: Int
    releaseQuarter: Int
    releaseType: ReleaseType!
    publicationStatus: PublicationStatus!
    confirmationStatus: ConfirmationStatus!
    seasonNumber: Int
    episodeNumber: Int
    sourceUrl: String
    notes: String!
    createdBy: String!
    updatedBy: String!
    createdAt: Float!
    updatedAt: Float!
    isWatchlisted: Boolean!
    matchScore: MatchScore
  }

  type ReleaseEventConnection {
    items: [ReleaseEvent!]!
    total: Int!
  }

  type AdminReleaseStats {
    releasesThisMonth: Int!
    upcomingReleases: Int!
    drafts: Int!
    unconfirmed: Int!
    recentlyEdited: [ReleaseEvent!]!
  }

  input RegisterInput {
    name: String!
    email: String!
    password: String!
  }

  input LoginInput {
    email: String!
    password: String!
  }

  input SavedItemInput {
    userId: String
    tmdbId: Int!
    mediaType: MediaType!
    title: String!
    posterPath: String
    releaseDate: String
    voteAverage: Float
  }

  input RatingInput {
    userId: String
    tmdbId: Int!
    mediaType: MediaType!
    seasonNumber: Int
    title: String!
    posterPath: String
    releaseDate: String
    voteAverage: Float
    rating: Float!
  }

  input WatchProgressInput {
    userId: String
    tmdbId: Int!
    mediaType: MediaType!
    title: String!
    posterPath: String
    releaseDate: String
    voteAverage: Float
    status: WatchStatus!
    totalEpisodes: Int
  }

  input ReleaseEventInput {
    tmdbId: Int!
    mediaType: MediaType!
    title: String!
    posterPath: String
    backdropPath: String
    voteAverage: Float
    popularity: Float
    genreIds: [Int!]
    provider: String!
    region: String!
    releaseDate: String
    datePrecision: DatePrecision!
    releaseYear: Int
    releaseMonth: Int
    releaseQuarter: Int
    releaseType: ReleaseType!
    publicationStatus: PublicationStatus
    confirmationStatus: ConfirmationStatus!
    seasonNumber: Int
    episodeNumber: Int
    sourceUrl: String
    notes: String
  }

  input ReleaseEventPatchInput {
    tmdbId: Int
    mediaType: MediaType
    title: String
    posterPath: String
    backdropPath: String
    voteAverage: Float
    popularity: Float
    genreIds: [Int!]
    provider: String
    region: String
    releaseDate: String
    datePrecision: DatePrecision
    releaseYear: Int
    releaseMonth: Int
    releaseQuarter: Int
    releaseType: ReleaseType
    publicationStatus: PublicationStatus
    confirmationStatus: ConfirmationStatus
    seasonNumber: Int
    episodeNumber: Int
    sourceUrl: String
    notes: String
  }

  input ReleaseEventFilterInput {
    region: String
    providers: [String!]
    mediaType: MediaType
    releaseTypes: [ReleaseType!]
    confirmationStatuses: [ConfirmationStatus!]
    publicationStatus: PublicationStatus
    genreIds: [Int!]
    tmdbId: Int
    year: Int
    month: Int
    fromDate: String
    toDate: String
    datePrecision: DatePrecision
    sort: String
    limit: Int
    offset: Int
  }

  input EpisodeProgressInput {
    userId: String
    tmdbId: Int!
    title: String!
    posterPath: String
    releaseDate: String
    voteAverage: Float
    totalEpisodes: Int
    seasonNumber: Int!
    episodeNumber: Int!
    episodeTitle: String
    airDate: String
    runtime: Int
    stillPath: String
    watched: Boolean!
  }

  input SeasonEpisodeInput {
    episodeNumber: Int!
    episodeTitle: String
    airDate: String
    runtime: Int
    stillPath: String
  }

  input SeasonProgressInput {
    userId: String
    tmdbId: Int!
    title: String!
    posterPath: String
    releaseDate: String
    voteAverage: Float
    totalEpisodes: Int
    seasonNumber: Int!
    watched: Boolean!
    episodes: [SeasonEpisodeInput!]!
  }

  type Query {
    me: UserProfile
    home: HomeData!
    discover(
      media: MediaType!
      genre: String
      year: String
      sort: String
      page: Int
      language: String
      provider: String
    ): [MediaItem!]!
    discoverPage(
      media: MediaType!
      genre: String
      year: String
      sort: String
      page: Int
      language: String
      provider: String
    ): MediaItemConnection!
    search(query: String!, page: Int, language: String): [MediaItem!]!
    searchPage(query: String!, page: Int, language: String): MediaItemConnection!
    searchSuggestions(query: String!, limit: Int): [MediaItem!]!
    genres(media: MediaType!): [Genre!]!
    details(media: MediaType!, id: Int!, userId: String): MovieDetails!
    recommendations(media: MediaType!, id: Int!): [MediaItem!]!
    watchlist(userId: String!): [SavedItem!]!
    ratings(userId: String!): [RatingEntry!]!
    seasonDetails(tvId: Int!, seasonNumber: Int!, userId: String): SeasonDetails!
    watchProgress(userId: String!, tmdbId: Int!, mediaType: MediaType!): WatchProgress
    watchProgressList(userId: String!, mediaType: MediaType, status: WatchStatus): [WatchProgress!]!
    continueWatching(userId: String!): [WatchProgress!]!
    tasteProfile(userId: String): TasteDNAProfile!
    bingeStats(userId: String): BingeStats!
    personalizedRecommendations(
      userId: String
      mediaType: MediaType
      limit: Int
    ): [BingeRecommendationSection!]!
    matchScores(userId: String, items: [MatchScoreInput!]!): [MatchScore!]!
    matchExplanation(userId: String, item: MatchScoreInput!): MatchScore!
    releaseEvents(filter: ReleaseEventFilterInput): ReleaseEventConnection!
    releaseEventsByTitle(tmdbId: Int!, mediaType: MediaType!, region: String): [ReleaseEvent!]!
    watchlistReleaseEvents(userId: String!, region: String): [ReleaseEvent!]!
    adminReleaseEvents(filter: ReleaseEventFilterInput): ReleaseEventConnection!
    adminReleaseStats: AdminReleaseStats!
  }

  type Mutation {
    register(input: RegisterInput!): AuthPayload!
    login(input: LoginInput!): AuthPayload!
    logout: Boolean!
    addWatchlist(input: SavedItemInput!): SavedItem!
    removeWatchlist(userId: String!, tmdbId: Int!, mediaType: MediaType!): Boolean!
    rateMovie(input: RatingInput!): RatingEntry!
    removeRating(userId: String!, tmdbId: Int!, mediaType: MediaType!, seasonNumber: Int): Boolean!
    setWatchStatus(input: WatchProgressInput!): WatchProgress!
    removeWatchProgress(userId: String!, tmdbId: Int!, mediaType: MediaType!): Boolean!
    setEpisodeWatched(input: EpisodeProgressInput!): WatchProgress!
    setSeasonWatched(input: SeasonProgressInput!): WatchProgress!
    createReleaseEvent(input: ReleaseEventInput!): ReleaseEvent!
    updateReleaseEvent(id: ID!, input: ReleaseEventPatchInput!): ReleaseEvent!
    deleteReleaseEvent(id: ID!): Boolean!
    bulkCreateReleaseEvents(inputs: [ReleaseEventInput!]!): [ReleaseEvent!]!
    bulkUpdateReleaseEvents(ids: [ID!]!, input: ReleaseEventPatchInput!): [ReleaseEvent!]!
    bulkDeleteReleaseEvents(ids: [ID!]!): Boolean!
    recomputeTasteProfile(userId: String): TasteDNAProfile!
  }
`;
