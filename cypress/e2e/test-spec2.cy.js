describe('template spec 2', () => {
    it('passes', () => {
        cy.visit('https://example.cypress.io')
    })

    it('fails', () => {
        cy.visit('https://example.cypress.io')
        cy.get('non-existent-element').should('exist')
    })
})

