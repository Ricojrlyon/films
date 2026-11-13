# Politique de sécurité (CSP) : une balise <style> glissée dans la page est
# refusée, les styles du site (attributs style="…", style.css) marchent toujours
import unittest
from banc import Banc


class Csp(Banc):
    def setUp(self):
        super().setUp()
        self.violations = []
        self.page.on('console', lambda m: 'Content Security Policy' in m.text and self.violations.append(m.text[:120]))

    def test_S6_balise_style_refusee(self):
        self.ouvrir()
        applique = self.js('''(() => {
          const s = document.createElement("style");
          s.textContent = "body { outline: 6px solid rgb(0, 255, 0) }";
          document.head.appendChild(s);
          return getComputedStyle(document.body).outlineColor === "rgb(0, 255, 0)"; })()''')
        self.assertFalse(applique, 'une balise <style> ajoutée a été appliquée')
        self.violations.clear()  # celle-ci était attendue

    def test_S6_styles_du_site_intacts(self):
        self.ouvrir()
        self.page.click('.nav-btn[data-page="stats"]')
        self.page.wait_for_timeout(1200)
        # Barres des stats : leur longueur vient d'un attribut style="width:…"
        largeur = self.js('document.querySelector(".bar-fill").getBoundingClientRect().width')
        self.assertGreater(largeur, 10)
        self.page.click('.nav-btn[data-page="collection"]')
        self.page.locator('#grid .card').first.click()
        self.page.wait_for_timeout(600)
        self.assertTrue(self.js('document.getElementById("modal-backdrop").classList.contains("open")'))
        self.assertEqual(self.violations, [], 'styles du site bloqués')


if __name__ == '__main__':
    unittest.main()
