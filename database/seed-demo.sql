-- Demo floor plan + menu for restaurant 1. Safe to re-run.

-- Tables -----------------------------------------------------------------
insert into restaurant_tables (restaurant_id, code, display_name, capacity, table_type, shareable, shareable_party_sizes, pos_x, pos_y, width, height, shape)
values
  (1, 'A', 'Table A - Window', 4, 'standard', true, '{1,2}', 40, 40, 140, 100, 'rect'),
  (1, 'B', 'Table B - Window', 4, 'standard', true, '{1,2}', 220, 40, 140, 100, 'rect'),
  (1, 'C', 'Table C - Patio', 2, 'standard', false, '{}', 400, 40, 100, 100, 'round'),
  (1, 'D', 'Table D - Patio', 2, 'standard', false, '{}', 540, 40, 100, 100, 'round'),
  (1, 'E', 'Table E - Center', 6, 'standard', false, '{}', 40, 200, 180, 120, 'rect'),
  (1, 'F', 'Table F - Center', 6, 'standard', false, '{}', 260, 200, 180, 120, 'rect'),
  (1, 'G', 'Booth G', 4, 'booth', false, '{}', 480, 200, 140, 100, 'rect'),
  (1, 'H', 'Private Room H', 10, 'private', false, '{}', 40, 360, 260, 160, 'rect'),
  (1, 'J', 'Table J - Bar', 3, 'shared', true, '{1,2,3}', 340, 360, 130, 90, 'rect'),
  (1, 'K', 'Table K - Bar', 3, 'shared', true, '{1,2,3}', 500, 360, 130, 90, 'rect')
on conflict (restaurant_id, code) do nothing;

-- Seats: generate per table based on capacity
insert into table_seats (table_id, code, seat_index)
select t.id, t.code || '-' || gs, gs
from restaurant_tables t
cross join lateral generate_series(1, t.capacity) as gs
where t.restaurant_id = 1
on conflict (table_id, code) do nothing;

-- A permanent, approval-required combination for big walk-in groups (E + F = 12 together)
insert into table_combinations (restaurant_id, name, table_ids, requires_approval)
select 1, 'Center E+F (12 seats together)', array[e.id, f.id], true
from restaurant_tables e, restaurant_tables f
where e.restaurant_id = 1 and e.code = 'E' and f.restaurant_id = 1 and f.code = 'F'
on conflict do nothing;

-- Menu ---------------------------------------------------------------------
insert into menu_categories (restaurant_id, name, sort_order) values
  (1, 'Starters', 1),
  (1, 'Vegetarian Mains', 2),
  (1, 'Non-Vegetarian Mains', 3),
  (1, 'Sides', 4),
  (1, 'Desserts', 5),
  (1, 'Ice Creams', 6),
  (1, 'Soft Drinks & Colas', 7),
  (1, 'Other Beverages', 8)
on conflict (restaurant_id, name) do nothing;

insert into menu_items (restaurant_id, category_id, name, description, price_cents, dietary_tags, allergens, complimentary, recommend_tags, meal_periods)
select 1, c.id, v.name, v.description, v.price_cents, v.dietary_tags, v.allergens, v.complimentary, v.recommend_tags, v.meal_periods
from menu_categories c
join (values
  ('Starters', 'Crispy Corn Chaat', 'Golden fried corn tossed in tangy chaat masala and herbs', 29000, array['vegetarian','vegan'], array[]::text[], false, array['spicy','popular'], array['lunch','dinner']),
  ('Starters', 'Tandoori Chicken Skewers', 'Char-grilled chicken marinated overnight in yogurt and spices', 39900, array[]::text[], array['dairy'], false, array['chef_pick'], array['lunch','dinner']),
  ('Starters', 'Garlic Herb Bread', 'Oven-baked bread brushed with garlic butter and herbs', 19900, array['vegetarian'], array['gluten','dairy'], true, array[]::text[], array['lunch','dinner']),
  ('Vegetarian Mains', 'Paneer Tikka Masala', 'Grilled paneer in a creamy tomato-based curry', 42900, array['vegetarian'], array['dairy'], false, array['popular'], array['lunch','dinner']),
  ('Vegetarian Mains', 'Dal Makhani', 'Slow-cooked black lentils finished with cream and butter', 34900, array['vegetarian'], array['dairy'], false, array['comfort_food'], array['lunch','dinner']),
  ('Non-Vegetarian Mains', 'Butter Chicken', 'Classic tomato-butter curry with tender chicken', 46900, array[]::text[], array['dairy'], false, array['popular','chef_pick'], array['lunch','dinner']),
  ('Non-Vegetarian Mains', 'Grilled Fish Tikka', 'Lightly spiced grilled fish with mint chutney', 52900, array[]::text[], array['fish'], false, array['spicy'], array['dinner']),
  ('Sides', 'Steamed Basmati Rice', 'Fragrant long-grain rice', 12900, array['vegetarian','vegan'], array[]::text[], false, array[]::text[], array['lunch','dinner']),
  ('Sides', 'Butter Naan', 'Soft tandoor-baked bread brushed with butter', 9900, array['vegetarian'], array['gluten','dairy'], false, array[]::text[], array['lunch','dinner']),
  ('Desserts', 'Gulab Jamun', 'Warm milk dumplings soaked in rose-cardamom syrup', 17900, array['vegetarian'], array['dairy','gluten'], false, array['popular'], array['dinner']),
  ('Desserts', 'Chocolate Lava Cake', 'Warm chocolate cake with a molten center, served with vanilla ice cream', 24900, array['vegetarian'], array['dairy','gluten','egg'], false, array['chef_pick'], array['dinner']),
  ('Ice Creams', 'Vanilla Bean Ice Cream', 'Classic Madagascar vanilla', 12900, array['vegetarian'], array['dairy'], false, array[]::text[], array['lunch','dinner']),
  ('Ice Creams', 'Mango Kulfi', 'Traditional Indian frozen dessert with real mango', 14900, array['vegetarian'], array['dairy'], false, array['seasonal'], array['dinner']),
  ('Soft Drinks & Colas', 'Masala Cola', 'House cola with a spiced twist', 8900, array['vegan'], array[]::text[], false, array[]::text[], array['breakfast','lunch','dinner']),
  ('Soft Drinks & Colas', 'Fresh Lime Soda', 'Sweet, salted, or mixed -- made fresh to order', 7900, array['vegan'], array[]::text[], false, array[]::text[], array['breakfast','lunch','dinner']),
  ('Other Beverages', 'Masala Chai', 'Spiced Indian tea brewed with milk', 6900, array['vegetarian'], array['dairy'], false, array[]::text[], array['breakfast']),
  ('Other Beverages', 'Fresh Watermelon Juice', 'Chilled, seasonal, no added sugar', 9900, array['vegan'], array[]::text[], false, array['seasonal'], array['lunch'])
) as v(category, name, description, price_cents, dietary_tags, allergens, complimentary, recommend_tags, meal_periods)
  on v.category = c.name
where c.restaurant_id = 1
on conflict do nothing;
