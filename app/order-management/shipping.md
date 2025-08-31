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


var request = require("request");
var payload = {
    "shop_no": 1,
    "requests": [
        {
            "shipping_code": "D-20190108-0000791-00",
            "order_id": "20190108-0000791",
            "status": "shipped",
            "status_additional_info": null,
            "tracking_no": null,
            "shipping_company_code": null
        },
        {
            "shipping_code": "D-20190108-0000801-00",
            "order_id": "20190108-0000801",
            "status": "shipped",
            "status_additional_info": null,
            "tracking_no": null,
            "shipping_company_code": null
        }
    ]
};
var options = { method: 'PUT',
  url: 'https://{mallid}.cafe24api.com/api/v2/admin/shipments',
  headers: {
    'Authorization': "Bearer {access_token}",
    'Content-Type': "application/json",
    'X-Cafe24-Api-Version': "{version}"
  },
  body: payload,
  json: true
};
request(options, function (error, response, body) {
  if (error) throw new Error(error);
  
  console.log(body);
});

{
    "shipments": [
        {
            "shop_no": 1,
            "shipping_code": "D-20190108-0000791-00",
            "order_id": "20190108-0000791",
            "status": "shipped",
            "status_additional_info": "Arrived at Sorting Hub",
            "tracking_no": null,
            "shipping_company_code": null
        },
        {
            "shop_no": 1,
            "shipping_code": "D-20190108-0000801-00",
            "order_id": "20190108-0000801",
            "status": "shipped",
            "status_additional_info": "Arrived at Sorting Hub",
            "tracking_no": null,
            "shipping_company_code": null
        }
    ]
}

status	
주문상태

status 사용하여 배송상태 수정시 tracking_no, shipping_company_code는 사용 불가

standby : 배송대기
shipping : 배송중
shipped : 배송완료