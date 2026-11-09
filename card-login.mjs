
const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};

function reply(statusCode, data) {
  return new Response(JSON.stringify(data), {
    status: statusCode,
    headers
  });
}

export default async function (request) {
  if (request.method !== "POST") {
    return reply(405, {
      success: false,
      message: "Method not allowed"
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return reply(500, {
      success: false,
      message: "Server configuration is missing"
    });
  }

  try {
    const body = await request.json();

    const uid = String(body.uid || "")
      .replace(/[^a-fA-F0-9]/g, "")
      .toUpperCase();

    if (!/^[A-F0-9]{8,20}$/.test(uid)) {
      return reply(400, {
        success: false,
        message: "Invalid card UID"
      });
    }

    const endpoint = new URL(
      "/rest/v1/metro_cards",
      supabaseUrl
    );

    endpoint.searchParams.set("card_uid", `eq.${uid}`);
    endpoint.searchParams.set(
      "select",
      "id,card_code,owner_name,card_type,card_mode,balance,trips_remaining,is_active,expires_at"
    );
    endpoint.searchParams.set("limit", "1");

    const response = await fetch(endpoint, {
      headers: {
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`
      }
    });

    if (!response.ok) {
      return reply(502, {
        success: false,
        message: "Database request failed"
      });
    }

    const cards = await response.json();

    if (!cards.length) {
      return reply(404, {
        success: false,
        message: "البطاقة غير مسجلة في النظام"
      });
    }

    const card = cards[0];

    if (!card.is_active) {
      return reply(403, {
        success: false,
        message: "هذه البطاقة غير مفعّلة"
      });
    }

    if (
      card.expires_at &&
      new Date(card.expires_at).getTime() < Date.now()
    ) {
      return reply(403, {
        success: false,
        message: "انتهت صلاحية البطاقة"
      });
    }

    return reply(200, {
      success: true,
      card: {
        id: card.id,
        code: card.card_code,
        name: card.owner_name,
        type: card.card_type,
        mode: card.card_mode,
        balance: card.balance,
        tripsRemaining: card.trips_remaining,
        expiresAt: card.expires_at
      }
    });

  } catch (error) {
    console.error(error);

    return reply(500, {
      success: false,
      message: "حدث خطأ أثناء التحقق من البطاقة"
    });
  }
}
