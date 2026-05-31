import UIKit
import SwiftUI

/// Entry point for the Share Extension.
/// iOS instantiates this class when the user picks "RechnungsTransfer"
/// from the share sheet. We embed a SwiftUI view inside it.
class ShareViewController: UIViewController {

    override func viewDidLoad() {
        super.viewDidLoad()

        guard let ctx = extensionContext else { return }

        let rootView = ShareView(
            extensionContext: ctx,
            onDone: { ctx.completeRequest(returningItems: [], completionHandler: nil) },
            onCancel: { ctx.cancelRequest(withError: NSError(domain: "UserCancelled", code: 0)) }
        )

        let hosting = UIHostingController(rootView: rootView)
        addChild(hosting)
        view.addSubview(hosting.view)
        hosting.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            hosting.view.topAnchor.constraint(equalTo: view.topAnchor),
            hosting.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hosting.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hosting.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        hosting.didMove(toParent: self)
    }
}
