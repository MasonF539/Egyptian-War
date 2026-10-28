# Function documentation

Add JSDoc (`/** ... */`) immediately before named functions, methods, accessors,
and named function-valued helpers so editor hover shows their purpose. Describe
the actual behavior; include parameter, return-value, and thrown-error details
when they clarify the contract. Keep existing descriptions accurate when code
changes. Anonymous inline callbacks do not need boilerplate descriptions.

JSDoc-only edits may remain source-only: do not publish packages, change package
versions, rebuild package artifacts, or generate install patches solely to ship
these comments.
