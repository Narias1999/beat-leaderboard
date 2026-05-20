I want to create a strava leaderboard website from a strava club.

the riders of the leaderboard are all the riders of the club
1- on a simple website display the leaderboard of riders
  it should have a table and by default display the leaderboard by distance but you should be able to switch also to elevation gain. als by default it should show all time but you should be able to filter by last week, last month, year to date.

2- Need to define the approach, it could be either:
   - every time I load the app I make all the requests to strava to render the leaderboard
   - have a background job running twice per day that gets the data from strava and stores them in a database, then we just make requests to our database.


Define the tech stack and brainstorm best approaches for this