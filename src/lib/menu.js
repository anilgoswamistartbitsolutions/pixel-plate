import { query } from "@/lib/db";

const MEAL_PERIOD_BY_HOUR = (hour) => {
  if (hour < 11) return "breakfast";
  if (hour < 17) return "lunch";
  return "dinner";
};

/** Sold-out is scoped to the day it was marked -- lazily un-marks anything whose sold_out_date
 * has passed so a "sold out today" never silently stays sold out tomorrow. No cron needed:
 * every read path below calls this first. */
export async function expireSoldOut(restaurantId) {
  await query(
    "update menu_items set sold_out = false, sold_out_date = null where restaurant_id = $1 and sold_out = true and sold_out_date < current_date",
    [restaurantId]
  );
}

export async function listMenu({ restaurantId, mealPeriod, categoryId, onlyAvailable = true }) {
  await expireSoldOut(restaurantId);
  const conditions = ["m.restaurant_id = $1"];
  const values = [restaurantId];
  if (onlyAvailable) {
    conditions.push("m.available = true", "m.sold_out = false");
  }
  if (mealPeriod) {
    values.push(mealPeriod);
    conditions.push(`$${values.length} = any(m.meal_periods)`);
  }
  if (categoryId) {
    values.push(categoryId);
    conditions.push(`m.category_id = $${values.length}`);
  }
  const result = await query(
    `select m.*, c.name as category_name
     from menu_items m
     left join menu_categories c on c.id = m.category_id
     where ${conditions.join(" and ")}
     order by c.sort_order, m.name`,
    values
  );
  return result.rows;
}

export async function listCategories(restaurantId) {
  const result = await query(
    "select * from menu_categories where restaurant_id = $1 and active = true order by sort_order, name",
    [restaurantId]
  );
  return result.rows;
}

export function currentMealPeriod() {
  return MEAL_PERIOD_BY_HOUR(new Date().getHours());
}

export async function getDailySpecials(restaurantId) {
  const today = new Date().toISOString().slice(0, 10);
  const result = await query(
    `select m.*, c.name as category_name from menu_items m
     left join menu_categories c on c.id = m.category_id
     where m.restaurant_id = $1 and m.available = true and m.sold_out = false
       and (m.special_start_date is null or m.special_start_date <= $2)
       and (m.special_end_date is null or m.special_end_date >= $2)
       and 'chef_pick' = any(m.recommend_tags)
     order by m.name`,
    [restaurantId, today]
  );
  return result.rows;
}

export async function recommendItems({ restaurantId, dietary, tag }) {
  const conditions = ["restaurant_id = $1", "available = true", "sold_out = false"];
  const values = [restaurantId];
  if (dietary) {
    values.push(dietary);
    conditions.push(`$${values.length} = any(dietary_tags)`);
  }
  if (tag) {
    values.push(tag);
    conditions.push(`$${values.length} = any(recommend_tags)`);
  }
  const result = await query(
    `select * from menu_items where ${conditions.join(" and ")} order by name limit 10`,
    values
  );
  return result.rows;
}

export async function upsertMenuItem(restaurantId, item) {
  if (item.id) {
    const result = await query(
      `update menu_items set
        category_id=$2, name=$3, description=$4, price_cents=$5, available=$6, sold_out=$7,
        availability_days=$8, meal_periods=$9, special_start_date=$10, special_end_date=$11,
        dietary_tags=$12, allergens=$13, complimentary=$14, complimentary_condition=$15,
        recommend_tags=$16, updated_at = now()
       where id = $1 and restaurant_id = $17 returning *`,
      [
        item.id, item.categoryId, item.name, item.description, item.priceCents, item.available, item.soldOut,
        item.availabilityDays, item.mealPeriods, item.specialStartDate || null, item.specialEndDate || null,
        item.dietaryTags || [], item.allergens || [], item.complimentary || false, item.complimentaryCondition || null,
        item.recommendTags || [], restaurantId
      ]
    );
    return result.rows[0];
  }
  const result = await query(
    `insert into menu_items
      (restaurant_id, category_id, name, description, price_cents, available, sold_out,
       availability_days, meal_periods, special_start_date, special_end_date, dietary_tags, allergens,
       complimentary, complimentary_condition, recommend_tags)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning *`,
    [
      restaurantId, item.categoryId, item.name, item.description, item.priceCents || 0, item.available !== false,
      item.soldOut || false, item.availabilityDays || [1, 2, 3, 4, 5, 6, 7], item.mealPeriods || ["breakfast", "lunch", "dinner"],
      item.specialStartDate || null, item.specialEndDate || null, item.dietaryTags || [], item.allergens || [],
      item.complimentary || false, item.complimentaryCondition || null, item.recommendTags || []
    ]
  );
  return result.rows[0];
}

export async function setSoldOut(restaurantId, itemId, soldOut) {
  const result = await query(
    `update menu_items set sold_out = $3, sold_out_date = case when $3 then current_date else null end, updated_at = now()
     where id = $1 and restaurant_id = $2 returning *`,
    [itemId, restaurantId, soldOut]
  );
  return result.rows[0];
}

export async function upsertCategory(restaurantId, category) {
  if (category.id) {
    const result = await query(
      "update menu_categories set name=$2, sort_order=$3, active=$4 where id=$1 and restaurant_id=$5 returning *",
      [category.id, category.name, category.sortOrder || 0, category.active !== false, restaurantId]
    );
    return result.rows[0];
  }
  const result = await query(
    "insert into menu_categories (restaurant_id, name, sort_order) values ($1,$2,$3) returning *",
    [restaurantId, category.name, category.sortOrder || 0]
  );
  return result.rows[0];
}
