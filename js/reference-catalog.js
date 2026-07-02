/**
 * ReferenceCatalog - listas de referência completas (Messier por enquanto)
 * usadas SÓ pra calcular cobertura ("o que falta do universo"), não entram
 * no catálogo do usuário automaticamente.
 */
window.ReferenceCatalog = (function () {
  // id, constelação, tipo simplificado — dado astronômico público, sem direitos de autor
  const MESSIER = [
    ['M1', 'Taurus', 'nebulosa'], ['M2', 'Aquarius', 'aglomerado'], ['M3', 'Canes Venatici', 'aglomerado'],
    ['M4', 'Scorpius', 'aglomerado'], ['M5', 'Serpens', 'aglomerado'], ['M6', 'Scorpius', 'aglomerado'],
    ['M7', 'Scorpius', 'aglomerado'], ['M8', 'Sagittarius', 'nebulosa'], ['M9', 'Ophiuchus', 'aglomerado'],
    ['M10', 'Ophiuchus', 'aglomerado'], ['M11', 'Scutum', 'aglomerado'], ['M12', 'Ophiuchus', 'aglomerado'],
    ['M13', 'Hercules', 'aglomerado'], ['M14', 'Ophiuchus', 'aglomerado'], ['M15', 'Pegasus', 'aglomerado'],
    ['M16', 'Serpens', 'nebulosa'], ['M17', 'Sagittarius', 'nebulosa'], ['M18', 'Sagittarius', 'aglomerado'],
    ['M19', 'Ophiuchus', 'aglomerado'], ['M20', 'Sagittarius', 'nebulosa'], ['M21', 'Sagittarius', 'aglomerado'],
    ['M22', 'Sagittarius', 'aglomerado'], ['M23', 'Sagittarius', 'aglomerado'], ['M24', 'Sagittarius', 'aglomerado'],
    ['M25', 'Sagittarius', 'aglomerado'], ['M26', 'Scutum', 'aglomerado'], ['M27', 'Vulpecula', 'nebulosa'],
    ['M28', 'Sagittarius', 'aglomerado'], ['M29', 'Cygnus', 'aglomerado'], ['M30', 'Capricornus', 'aglomerado'],
    ['M31', 'Andromeda', 'galaxia'], ['M32', 'Andromeda', 'galaxia'], ['M33', 'Triangulum', 'galaxia'],
    ['M34', 'Perseus', 'aglomerado'], ['M35', 'Gemini', 'aglomerado'], ['M36', 'Auriga', 'aglomerado'],
    ['M37', 'Auriga', 'aglomerado'], ['M38', 'Auriga', 'aglomerado'], ['M39', 'Cygnus', 'aglomerado'],
    ['M40', 'Ursa Major', 'aglomerado'], ['M41', 'Canis Major', 'aglomerado'], ['M42', 'Orion', 'nebulosa'],
    ['M43', 'Orion', 'nebulosa'], ['M44', 'Cancer', 'aglomerado'], ['M45', 'Taurus', 'aglomerado'],
    ['M46', 'Puppis', 'aglomerado'], ['M47', 'Puppis', 'aglomerado'], ['M48', 'Hydra', 'aglomerado'],
    ['M49', 'Virgo', 'galaxia'], ['M50', 'Monoceros', 'aglomerado'], ['M51', 'Canes Venatici', 'galaxia'],
    ['M52', 'Cassiopeia', 'aglomerado'], ['M53', 'Coma Berenices', 'aglomerado'], ['M54', 'Sagittarius', 'aglomerado'],
    ['M55', 'Sagittarius', 'aglomerado'], ['M56', 'Lyra', 'aglomerado'], ['M57', 'Lyra', 'nebulosa'],
    ['M58', 'Virgo', 'galaxia'], ['M59', 'Virgo', 'galaxia'], ['M60', 'Virgo', 'galaxia'],
    ['M61', 'Virgo', 'galaxia'], ['M62', 'Ophiuchus', 'aglomerado'], ['M63', 'Canes Venatici', 'galaxia'],
    ['M64', 'Coma Berenices', 'galaxia'], ['M65', 'Leo', 'galaxia'], ['M66', 'Leo', 'galaxia'],
    ['M67', 'Cancer', 'aglomerado'], ['M68', 'Hydra', 'aglomerado'], ['M69', 'Sagittarius', 'aglomerado'],
    ['M70', 'Sagittarius', 'aglomerado'], ['M71', 'Sagitta', 'aglomerado'], ['M72', 'Aquarius', 'aglomerado'],
    ['M73', 'Aquarius', 'aglomerado'], ['M74', 'Pisces', 'galaxia'], ['M75', 'Sagittarius', 'aglomerado'],
    ['M76', 'Perseus', 'nebulosa'], ['M77', 'Cetus', 'galaxia'], ['M78', 'Orion', 'nebulosa'],
    ['M79', 'Lepus', 'aglomerado'], ['M80', 'Scorpius', 'aglomerado'], ['M81', 'Ursa Major', 'galaxia'],
    ['M82', 'Ursa Major', 'galaxia'], ['M83', 'Hydra', 'galaxia'], ['M84', 'Virgo', 'galaxia'],
    ['M85', 'Coma Berenices', 'galaxia'], ['M86', 'Virgo', 'galaxia'], ['M87', 'Virgo', 'galaxia'],
    ['M88', 'Coma Berenices', 'galaxia'], ['M89', 'Virgo', 'galaxia'], ['M90', 'Virgo', 'galaxia'],
    ['M91', 'Coma Berenices', 'galaxia'], ['M92', 'Hercules', 'aglomerado'], ['M93', 'Puppis', 'aglomerado'],
    ['M94', 'Canes Venatici', 'galaxia'], ['M95', 'Leo', 'galaxia'], ['M96', 'Leo', 'galaxia'],
    ['M97', 'Ursa Major', 'nebulosa'], ['M98', 'Coma Berenices', 'galaxia'], ['M99', 'Coma Berenices', 'galaxia'],
    ['M100', 'Coma Berenices', 'galaxia'], ['M101', 'Ursa Major', 'galaxia'], ['M102', 'Draco', 'galaxia'],
    ['M103', 'Cassiopeia', 'aglomerado'], ['M104', 'Virgo', 'galaxia'], ['M105', 'Leo', 'galaxia'],
    ['M106', 'Canes Venatici', 'galaxia'], ['M107', 'Ophiuchus', 'aglomerado'], ['M108', 'Ursa Major', 'galaxia'],
    ['M109', 'Ursa Major', 'galaxia'], ['M110', 'Andromeda', 'galaxia'],
  ].map(([id, constellation, type]) => ({ id, constellation, type }));

  return { MESSIER };
})();
