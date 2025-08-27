let trackResponse = await fetch("https://apis.tracker.delivery/graphql", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    // Instructions for obtaining [YOUR_CLIENT_ID] and [YOUR_CLIENT_SECRET] can be found in the documentation below:
    // See: https://tracker.delivery/docs/authentication
    "Authorization": "TRACKQL-API-KEY AA7bdo88pxq1B6L1NNJ9C3p2:8Auszg9Xlm45Zh1CJE8SkEaos8uX99CrvCp7dV6QR3j",
  },
  body: JSON.stringify({
    "query": `query Track(
$carrierId: ID!,
$trackingNumber: String!
) {
track(
  carrierId: $carrierId,
  trackingNumber: $trackingNumber
) {
  lastEvent {
    time
    status {
      code
    }
  }
}
}`.trim(),
    "variables": {
      "carrierId": "kr.hanjin",
      "trackingNumber": "460176571013"
    },
  }),
});
console.log(await trackResponse.json())

---응답

{
  "data": {
    "track": {
      "lastEvent": {
        "time": "2025-08-27T10:08:00.000+09:00",
        "status": {
          "code": "DELIVERED"
        }
      }
    }
  }
}