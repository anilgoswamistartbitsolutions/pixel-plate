-- Resets demo content to a generic California restaurant: USD pricing, broader categories,
-- floors, and a couple of sample menu configurations assigned to real dates. Safe to re-run
-- (clears prior demo menu items/categories first since names/prices are changing wholesale).

update restaurants set name = 'Pixel Plate' where id = 1;

update restaurant_settings set
  description = 'A modern California bistro serving fresh, seasonal plates with a relaxed coastal feel.',
  address = '482 Ocean Terrace, Santa Monica, CA 90401',
  phone = '+1 (310) 555-0142',
  total_seating_capacity = 44,
  amenities = '{"Full bar","Outdoor patio seating","Wheelchair accessible","Free WiFi","Dog-friendly patio","Valet parking on weekends"}',
  parking_info = 'Public parking is available adjacent to the restaurant; valet is offered Friday-Sunday evenings.',
  reservation_policy = 'Tables are held for 15 minutes past the reservation time. Parties of 7 or more require a credit card to hold.',
  cancellation_policy = 'Cancel or modify up to 2 hours before your reservation with no charge.',
  supported_languages = '{"English","Spanish"}',
  voice_greeting = 'Thanks for calling Pixel Plate! I can share our menu and hours, or help with a reservation or takeout order -- how can I help today?'
where restaurant_id = 1;

-- Remove old demo menu (safe: only touches rows created by seed-demo.sql / this script)
delete from menu_configuration_items where configuration_id in (select id from menu_configurations where restaurant_id = 1);
delete from menu_daily_schedule where restaurant_id = 1;
delete from menu_configurations where restaurant_id = 1;
delete from menu_items where restaurant_id = 1;
delete from menu_categories where restaurant_id = 1;

insert into menu_categories (restaurant_id, name, sort_order) values
  (1, 'Starters & Shareables', 1),
  (1, 'Soups & Salads', 2),
  (1, 'Sandwiches & Burgers', 3),
  (1, 'Entrees', 4),
  (1, 'Sides', 5),
  (1, 'Desserts', 6),
  (1, 'Kids Menu', 7),
  (1, 'Beverages', 8),
  (1, 'Beer & Wine', 9)
on conflict (restaurant_id, name) do nothing;

-- price_cents is literal USD cents (1495 = $14.95). meal_periods use the new slot names.
insert into menu_items (restaurant_id, category_id, name, description, price_cents, currency, dietary_tags, allergens, complimentary, recommend_tags, meal_periods)
select 1, c.id, v.name, v.description, v.price_cents, 'USD', v.dietary_tags, v.allergens, v.complimentary, v.recommend_tags, v.meal_periods
from menu_categories c
join (values
  ('Starters & Shareables', 'California Guacamole & Chips', 'Fresh avocado, lime, cilantro, house-fried tortilla chips', 1295, array['vegetarian','vegan','gluten_free'], array[]::text[], false, array['popular','fresh'], array['midday','evening']),
  ('Starters & Shareables', 'Crispy Brussels Sprouts', 'Charred sprouts, chili-lime glaze, cotija cheese', 1395, array['vegetarian','gluten_free'], array['dairy'], false, array['spicy','popular'], array['midday','evening']),
  ('Starters & Shareables', 'Ahi Tuna Poke Bowl Bites', 'Sushi-grade ahi, avocado, sesame, wonton crisps', 1695, array[]::text[], array['fish','sesame','soy'], false, array['chef_pick','fresh'], array['midday','evening']),
  ('Soups & Salads', 'Santa Monica Kale Caesar', 'Baby kale, shaved parmesan, sourdough croutons, lemon dressing', 1495, array['vegetarian'], array['dairy','gluten'], false, array['fresh','popular'], array['morning','midday','evening']),
  ('Soups & Salads', 'Heirloom Tomato & Burrata', 'Local heirloom tomatoes, burrata, basil oil, aged balsamic', 1595, array['vegetarian','gluten_free'], array['dairy'], false, array['fresh','seasonal'], array['midday','evening']),
  ('Soups & Salads', 'Butternut Squash Soup', 'Roasted squash, coconut cream, toasted pepitas', 1095, array['vegetarian','vegan','gluten_free'], array[]::text[], false, array['seasonal','comfort_food'], array['midday','evening']),
  ('Sandwiches & Burgers', 'Pixel Plate Classic Burger', 'Grass-fed beef, cheddar, house sauce, brioche bun, fries', 1895, array[]::text[], array['dairy','gluten'], false, array['popular','chef_pick'], array['midday','evening']),
  ('Sandwiches & Burgers', 'Baja Fish Tacos (3)', 'Beer-battered cod, cabbage slaw, chipotle crema, corn tortillas', 1795, array[]::text[], array['fish','gluten'], false, array['popular','spicy'], array['midday','evening']),
  ('Sandwiches & Burgers', 'Grilled Portobello Sandwich', 'Marinated portobello, roasted peppers, pesto, ciabatta', 1595, array['vegetarian'], array['gluten'], false, array['fresh'], array['midday','evening']),
  ('Entrees', 'Pan-Seared Salmon', 'Wild salmon, lemon-caper butter, seasonal vegetables', 2895, array['gluten_free'], array['fish'], false, array['chef_pick','fresh'], array['evening']),
  ('Entrees', 'Grilled Santa Barbara Ribeye', '14oz ribeye, garlic herb butter, roasted fingerlings', 4495, array['gluten_free'], array[]::text[], false, array['chef_pick'], array['evening']),
  ('Entrees', 'Wild Mushroom Risotto', 'Arborio rice, wild mushrooms, truffle oil, parmesan', 2295, array['vegetarian','gluten_free'], array['dairy'], false, array['comfort_food','popular'], array['evening']),
  ('Entrees', 'California Veggie Bowl', 'Quinoa, roasted vegetables, avocado, tahini dressing', 1895, array['vegetarian','vegan','gluten_free'], array[]::text[], false, array['fresh','popular'], array['morning','midday','evening']),
  ('Sides', 'Garlic Parmesan Fries', 'Hand-cut fries, garlic, parmesan, herbs', 795, array['vegetarian'], array['dairy'], false, array['popular'], array['midday','evening']),
  ('Sides', 'Grilled Seasonal Vegetables', 'Market vegetables, olive oil, sea salt', 795, array['vegetarian','vegan','gluten_free'], array[]::text[], false, array['fresh','seasonal'], array['midday','evening']),
  ('Desserts', 'Meyer Lemon Tart', 'Local Meyer lemon curd, shortbread crust, whipped cream', 995, array['vegetarian'], array['dairy','gluten','egg'], false, array['seasonal','popular'], array['evening']),
  ('Desserts', 'Warm Chocolate Lava Cake', 'Molten chocolate cake, vanilla bean ice cream', 1095, array['vegetarian'], array['dairy','gluten','egg'], false, array['chef_pick','popular'], array['evening']),
  ('Kids Menu', 'Kids Mac & Cheese', 'Classic cheddar mac, served with fruit cup', 795, array['vegetarian'], array['dairy','gluten'], true, array[]::text[], array['morning','midday','evening']),
  ('Kids Menu', 'Kids Cheeseburger Sliders (2)', 'Mini burgers, fries', 895, array[]::text[], array['dairy','gluten'], false, array[]::text[], array['midday','evening']),
  ('Beverages', 'Fresh-Squeezed Orange Juice', 'Locally sourced, squeezed to order', 595, array['vegan','gluten_free'], array[]::text[], false, array['fresh'], array['morning']),
  ('Beverages', 'Cold Brew Coffee', 'House cold brew, oat milk available', 495, array['vegan'], array['dairy'], false, array[]::text[], array['morning']),
  ('Beverages', 'San Pellegrino Sparkling Water', '', 495, array['vegan','gluten_free'], array[]::text[], false, array[]::text[], array['morning','midday','evening']),
  ('Beer & Wine', 'California Sauvignon Blanc (Glass)', 'Local Central Coast vineyard', 1295, array['vegan'], array['sulfites'], false, array[]::text[], array['midday','evening']),
  ('Beer & Wine', 'Local IPA (Draft)', 'Rotating Southern California brewery selection', 895, array[]::text[], array['gluten'], false, array[]::text[], array['midday','evening'])
) as v(category, name, description, price_cents, dietary_tags, allergens, complimentary, recommend_tags, meal_periods)
  on v.category = c.name
where c.restaurant_id = 1
on conflict do nothing;

-- A couple of ready-made menu configurations staff can assign to any date.
insert into menu_configurations (restaurant_id, name, description) values
  (1, 'Weekend Brunch Special', 'Lighter, brunch-forward items for Saturday/Sunday mornings.'),
  (1, 'Thanksgiving Special', 'Holiday-only entrees and desserts for Thanksgiving Day.')
on conflict (restaurant_id, name) do nothing;

insert into menu_configuration_items (configuration_id, menu_item_id)
select cfg.id, mi.id from menu_configurations cfg, menu_items mi
where cfg.restaurant_id = 1 and cfg.name = 'Weekend Brunch Special'
  and mi.restaurant_id = 1 and mi.name in ('Fresh-Squeezed Orange Juice', 'Cold Brew Coffee', 'Heirloom Tomato & Burrata', 'California Veggie Bowl', 'Meyer Lemon Tart')
on conflict do nothing;

insert into menu_configuration_items (configuration_id, menu_item_id)
select cfg.id, mi.id from menu_configurations cfg, menu_items mi
where cfg.restaurant_id = 1 and cfg.name = 'Thanksgiving Special'
  and mi.restaurant_id = 1 and mi.name in ('Butternut Squash Soup', 'Grilled Santa Barbara Ribeye', 'Wild Mushroom Risotto', 'Warm Chocolate Lava Cake')
on conflict do nothing;

-- Floors -- assign existing demo tables across them.
insert into floors (restaurant_id, name, sort_order) values
  (1, 'Main Dining Room', 1),
  (1, 'Ocean View Patio', 2),
  (1, 'Private Dining', 3)
on conflict (restaurant_id, name) do nothing;

update restaurant_tables set floor_id = (select id from floors where restaurant_id = 1 and name = 'Main Dining Room'), size_label = 'medium'
where restaurant_id = 1 and code in ('A', 'B', 'E', 'F');
update restaurant_tables set floor_id = (select id from floors where restaurant_id = 1 and name = 'Ocean View Patio'), size_label = 'small'
where restaurant_id = 1 and code in ('C', 'D', 'J', 'K');
update restaurant_tables set floor_id = (select id from floors where restaurant_id = 1 and name = 'Private Dining'), size_label = 'xl'
where restaurant_id = 1 and code in ('G', 'H');
